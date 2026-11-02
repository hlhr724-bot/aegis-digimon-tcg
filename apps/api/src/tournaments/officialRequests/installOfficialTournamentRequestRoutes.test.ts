import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { FeedbackStore } from "#api/bugs/FeedbackStore";
import { validate } from "#api/bugs/routes";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { installOfficialTournamentRequestRoutes } from "#api/tournaments/officialRequests/installOfficialTournamentRequestRoutes";
import { OfficialTournamentRequestStore } from "#api/tournaments/officialRequests/OfficialTournamentRequestStore";
import { FeedbackStatus } from "@aegis/shared/feedback/FeedbackStatus";
import {
  OFFICIAL_TOURNAMENT_REQUEST_MESSAGE_MAX,
  type OfficialTournamentRequest,
} from "@aegis/shared/tournaments/OfficialTournamentRequest";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";

type Harness = {
  accounts: AccountStore;
  feedback: FeedbackStore;
  url: string;
  organizer: string;
  player: string;
  adminId: string;
  tournamentId: string;
  close: () => Promise<void>;
};

type CookieParams = { accounts: AccountStore; name: string; isAdmin?: boolean };
type CallParams = { method?: string; cookie?: string; body?: unknown };
type RequestBody = { request: OfficialTournamentRequest | null };

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
  installOfficialTournamentRequestRoutes({
    app,
    store: new OfficialTournamentRequestStore(accounts),
    session: (req) => accounts.session(/aegis_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1]),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const organizer = await signIn({ accounts, name: "Organizer" });
  const tournament = await accounts.createTournament(organizer.id, {
    name: "Weekly cup",
    block: "BT10",
    startsAt: 1_800_000_000_000,
    maxPlayers: 8,
  });
  harness = {
    accounts,
    feedback: new FeedbackStore(accounts),
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    organizer: organizer.cookie,
    player: (await signIn({ accounts, name: "Player" })).cookie,
    adminId: (await signIn({ accounts, name: "Admin", isAdmin: true })).id,
    tournamentId: tournament.id,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
});

afterEach(async () => {
  await harness.close();
  await harness.accounts.close();
});

function call({ method = "GET", cookie, body }: CallParams = {}, tournamentId = harness.tournamentId) {
  return fetch(`${harness.url}/tournaments/${tournamentId}/official-request`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function submit(message: unknown = "  Weekly store league  ") {
  return call({ method: "POST", cookie: harness.organizer, body: { message } });
}

async function current(): Promise<OfficialTournamentRequest | null> {
  return ((await (await call({ cookie: harness.organizer })).json()) as RequestBody).request;
}

async function category(): Promise<string> {
  const { rows } = await harness.accounts.pool.query<{ category: string }>(
    "SELECT category FROM tournaments WHERE id=$1",
    [harness.tournamentId],
  );
  return rows[0]!.category;
}

async function triage(id: number, status: FeedbackStatus, finalReply = "") {
  const detail = await harness.feedback.detail(id);
  return harness.feedback.triage(id, harness.adminId, {
    revision: detail!.revision,
    status,
    finalReply,
    internalNote: "",
    duplicateOfId: null,
  });
}

describe("requesting official status for a tournament", () => {
  it("files the organizer's request in the feedback queue with a trimmed message", async () => {
    const response = await submit();

    expect(response.status).toBe(201);
    const { request } = (await response.json()) as RequestBody;
    expect(request).toMatchObject({
      status: FeedbackStatus.NEW.value,
      message: "Weekly store league",
      finalReply: null,
    });
    const queue = await harness.feedback.list({ kind: "official_tournament" });
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: request!.id,
        githubStatus: "disabled",
        report: expect.objectContaining({
          kind: "official_tournament",
          summary: "Official status request: Weekly cup",
          tournamentId: harness.tournamentId,
          reporterName: "Organizer",
        }),
      }),
    ]);
  });

  it("stores a request without a message", async () => {
    const response = await submit(null);

    expect(response.status).toBe(201);
    expect(await current()).toMatchObject({ message: null });
  });

  it("refuses non-text messages and messages past the limit", async () => {
    for (const message of [42, "x".repeat(OFFICIAL_TOURNAMENT_REQUEST_MESSAGE_MAX + 1)]) {
      const response = await submit(message);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_official_request" });
    }
  });

  it("lets only the signed-in organizer read or send requests", async () => {
    expect((await call({ method: "POST", body: {} })).status).toBe(401);
    const response = await call({ method: "POST", cookie: harness.player, body: {} });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_organizer" });
    expect((await call({ cookie: harness.player })).status).toBe(403);
  });

  it("answers 404 for an unknown or malformed tournament id", async () => {
    expect((await call({ cookie: harness.organizer }, "e9db0e41-aff5-495c-a971-45f61e84546e")).status).toBe(404);
    expect((await call({ cookie: harness.organizer }, "not-a-uuid")).status).toBe(404);
  });

  it("keeps one open request per tournament", async () => {
    await submit();
    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "request_pending" });
  });

  it("refuses a tournament that already started", async () => {
    await harness.accounts.pool.query("UPDATE tournaments SET status='running' WHERE id=$1", [harness.tournamentId]);

    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "tournament_already_started" });
  });

  it("refuses a tournament that is already official", async () => {
    await harness.accounts.setTournamentCategory(harness.tournamentId, TournamentCategory.OFFICIAL.value);

    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_official" });
  });

  it("lets the organizer cancel a pending request and ask again", async () => {
    await submit();

    const cancelled = await call({ method: "DELETE", cookie: harness.organizer });

    expect(cancelled.status).toBe(200);
    expect(await current()).toBeNull();
    expect((await call({ method: "DELETE", cookie: harness.organizer })).status).toBe(404);
    expect((await submit()).status).toBe(201);
  });

  it("makes the tournament official when an admin resolves the request", async () => {
    const { request } = (await (await submit()).json()) as RequestBody;

    await triage(request!.id, FeedbackStatus.RESOLVED.value, "Approved, welcome aboard.");

    expect(await category()).toBe(TournamentCategory.OFFICIAL.value);
    expect(await current()).toMatchObject({
      status: FeedbackStatus.RESOLVED.value,
      finalReply: "Approved, welcome aboard.",
    });
  });

  it("shows the admin's reply after a rejection and accepts a new request", async () => {
    const { request } = (await (await submit()).json()) as RequestBody;

    await triage(request!.id, FeedbackStatus.WONT_FIX.value, "Add a prize description first.");

    expect(await category()).toBe(TournamentCategory.COMMUNITY.value);
    expect(await current()).toMatchObject({ finalReply: "Add a prize description first." });
    expect((await submit()).status).toBe(201);
    expect(await current()).toMatchObject({ status: FeedbackStatus.NEW.value });
  });

  it("is not accepted through the public report form", () => {
    expect(validate({ kind: "official_tournament", summary: "Make it official", description: "Please" })).toEqual({
      error: "invalid_kind",
    });
  });
});
