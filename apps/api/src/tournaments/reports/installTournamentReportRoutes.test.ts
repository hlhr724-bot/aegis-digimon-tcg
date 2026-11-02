import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { installTournamentReportRoutes } from "#api/tournaments/reports/installTournamentReportRoutes";
import { TournamentReportStore } from "#api/tournaments/reports/TournamentReportStore";
import type { TournamentReport } from "@aegis/shared/tournaments/TournamentReport";
import { TOURNAMENT_REPORT_DETAILS_MAX } from "@aegis/shared/tournaments/TournamentReportInput";
import { TournamentReportAction } from "@aegis/shared/tournaments/TournamentReportAction";
import { TournamentReportReason } from "@aegis/shared/tournaments/TournamentReportReason";

type Harness = {
  accounts: AccountStore;
  url: string;
  organizer: string;
  player: string;
  admin: string;
  tournamentId: string;
  close: () => Promise<void>;
};

type CookieParams = { accounts: AccountStore; name: string; isAdmin?: boolean };
type CallParams = { method?: string; cookie?: string; body?: unknown };

let harness: Harness;

async function signIn({ accounts, name, isAdmin = false }: CookieParams) {
  const account = await accounts.accountForIdentity("discord", name, name);
  if (isAdmin) {
    await accounts.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [account.id]);
  }
  return { id: account.id, cookie: `aegis_session=${(await accounts.issueSession(account)).id}` };
}

beforeEach(async () => {
  const accounts = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installTournamentReportRoutes({
    app,
    accounts,
    store: new TournamentReportStore(accounts),
    session: (req) => accounts.session(/aegis_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1]),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const organizer = await signIn({ accounts, name: "Organizer" });
  const tournament = await accounts.createTournament(organizer.id, {
    name: "Rude event",
    block: "BT10",
    startsAt: 1_800_000_000_000,
    maxPlayers: 8,
  });
  harness = {
    accounts,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    organizer: organizer.cookie,
    player: (await signIn({ accounts, name: "Player" })).cookie,
    admin: (await signIn({ accounts, name: "Admin", isAdmin: true })).cookie,
    tournamentId: tournament.id,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
});

afterEach(async () => {
  await harness.close();
  await harness.accounts.close();
});

function call(path: string, { method = "GET", cookie, body }: CallParams = {}) {
  return fetch(`${harness.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function report(cookie: string | undefined, body: unknown, tournamentId = harness.tournamentId) {
  return call(`/tournaments/${tournamentId}/reports`, { method: "POST", cookie, body });
}

async function listReports(cookie = harness.admin): Promise<TournamentReport[]> {
  return (
    (await (await call("/account/admin/tournament-reports", { cookie })).json()) as { reports: TournamentReport[] }
  ).reports;
}

function resolveReport(reportId: number, action: unknown, cookie = harness.admin) {
  return call(`/account/admin/tournament-reports/${reportId}/resolve`, { method: "POST", cookie, body: { action } });
}

const offensive = { reason: TournamentReportReason.OFFENSIVE_CONTENT.value, details: "  Slur in the title  " };

describe("reporting a tournament", () => {
  it("records a signed-in player's report with trimmed details", async () => {
    const response = await report(harness.player, offensive);

    expect(response.status).toBe(201);
    expect(await listReports()).toEqual([
      expect.objectContaining({
        tournamentId: harness.tournamentId,
        tournamentName: "Rude event",
        organizerName: "Organizer",
        reason: TournamentReportReason.OFFENSIVE_CONTENT.value,
        details: "Slur in the title",
        reporterName: "Player",
        openReportsForTournament: 1,
      }),
    ]);
  });

  it("requires a signed-in player", async () => {
    expect((await report(undefined, offensive)).status).toBe(401);
  });

  it("refuses unknown reasons, non-text details and details past the limit", async () => {
    for (const body of [
      { reason: "spam" },
      { reason: "constructor" },
      { reason: TournamentReportReason.OTHER.value, details: 42 },
      { reason: TournamentReportReason.OTHER.value, details: "x".repeat(TOURNAMENT_REPORT_DETAILS_MAX + 1) },
    ]) {
      const response = await report(harness.player, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_report" });
    }
  });

  it("refuses the organizer's report on their own event", async () => {
    const response = await report(harness.organizer, offensive);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "own_tournament" });
  });

  it("answers 404 for an unknown or malformed tournament id", async () => {
    expect((await report(harness.player, offensive, "e9db0e41-aff5-495c-a971-45f61e84546e")).status).toBe(404);
    expect((await report(harness.player, offensive, "not-a-uuid")).status).toBe(404);
  });

  it("keeps one open report per reporter when the same player reports again", async () => {
    await report(harness.player, offensive);
    await report(harness.player, { reason: TournamentReportReason.FAKE_EVENT.value });

    const reports = await listReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: TournamentReportReason.FAKE_EVENT.value, details: null });
  });

  it("limits how many reports a player sends in a short time", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await report(harness.player, offensive)).status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe("reviewing tournament reports", () => {
  it("is limited to administrators", async () => {
    await report(harness.player, offensive);
    const [open] = await listReports();

    expect((await call("/account/admin/tournament-reports")).status).toBe(401);
    expect((await call("/account/admin/tournament-reports", { cookie: harness.player })).status).toBe(403);
    expect((await resolveReport(open!.id, TournamentReportAction.DISMISS.value, harness.player)).status).toBe(403);
  });

  it("dismisses every open report of the tournament and keeps the event", async () => {
    await report(harness.player, offensive);
    await report((await signIn({ accounts: harness.accounts, name: "Second" })).cookie, offensive);
    const [open] = await listReports();

    const response = await resolveReport(open!.id, TournamentReportAction.DISMISS.value);

    expect(await response.json()).toEqual({ resolved: 2 });
    expect(await listReports()).toEqual([]);
    expect(await harness.accounts.tournament(harness.tournamentId)).toBeDefined();
    expect((await resolveReport(open!.id, TournamentReportAction.DISMISS.value)).status).toBe(404);
  });

  it("deletes an event that has not started and closes its reports", async () => {
    await report(harness.player, offensive);
    const [open] = await listReports();

    const response = await resolveReport(open!.id, TournamentReportAction.DELETE_TOURNAMENT.value);

    expect(await response.json()).toEqual({ resolved: 1 });
    expect(await harness.accounts.tournament(harness.tournamentId)).toBeUndefined();
    expect(await listReports()).toEqual([]);
  });

  it("refuses to delete a started event and leaves its report open", async () => {
    await report(harness.player, offensive);
    await harness.accounts.pool.query("UPDATE tournaments SET status='running' WHERE id=$1", [harness.tournamentId]);
    const [open] = await listReports();
    expect(open?.canDeleteTournament).toBe(false);

    const response = await resolveReport(open!.id, TournamentReportAction.DELETE_TOURNAMENT.value);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "tournament_already_started" });
    expect(await harness.accounts.tournament(harness.tournamentId)).toBeDefined();
    expect(await listReports()).toHaveLength(1);
  });

  it("refuses an unknown action or report id", async () => {
    await report(harness.player, offensive);
    const [open] = await listReports();

    expect((await resolveReport(open!.id, "hide")).status).toBe(400);
    expect((await resolveReport(0, TournamentReportAction.DISMISS.value)).status).toBe(400);
    expect((await resolveReport(open!.id + 100, TournamentReportAction.DISMISS.value)).status).toBe(404);
  });
});
