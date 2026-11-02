import { AccountRole } from "@aegis/shared/account/AccountRole";
import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  TournamentCircuitLeaderboard,
  TournamentCircuitSummary,
  TournamentCircuitView,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { AccountStore, type AuthSession } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { installTournamentCircuitRoutes } from "#api/tournaments/circuits/installTournamentCircuitRoutes";
import { scheduleCircuitTournaments } from "#api/tournaments/circuits/scheduleCircuitTournaments";
import { ParticipantStore } from "#api/tournaments/participants/ParticipantStore";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 86_400_000;

let accounts: AccountStore;
let server: Server;
let base: string;
let current: AuthSession | undefined;

const circuitBody = {
  name: "Weekend Circuit",
  startsAt: NOW,
  endsAt: NOW + 14 * DAY,
  timeZone: "America/Sao_Paulo",
  schedule: { cadence: "weekly", slots: [{ weekday: 6, localTime: "18:00" }] },
  template: {
    structure: "single_elimination",
    maxPlayers: 8,
    bestOf: 1,
    allowBots: true,
  },
};

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  await accounts.ensureReady();
  current = undefined;
  const app = express();
  app.use(express.json());
  installTournamentCircuitRoutes({
    app,
    accounts,
    participants: new ParticipantStore(accounts),
    session: async () => current,
    now: () => NOW,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server address missing");
  }
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await accounts.close();
});

async function signIn(name: string, isAdmin: boolean, roles: AccountRole[] = []): Promise<void> {
  const account = await accounts.accountForIdentity("email", name, name);
  current = {
    id: name,
    account: { ...account, isAdmin, roles },
    expiresAt: NOW + DAY,
  };
}

type Reply = TournamentCircuitView & {
  items: TournamentCircuitSummary[];
  reasons: unknown[];
} & Partial<TournamentCircuitLeaderboard>;

async function send(path: string, body?: unknown): Promise<{ status: number; body: Reply }> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Reply };
}

describe("tournament circuit routes", () => {
  it.each([{ roles: [] }, { roles: [AccountRole.JUDGE.value] }])(
    "rejects circuit creation without organizer permission for roles $roles",
    async ({ roles }) => {
      expect((await send("/tournament-circuits", circuitBody)).status).toBe(401);
      await signIn("player", false, roles);
      expect(await send("/tournament-circuits", circuitBody)).toEqual({
        status: 403,
        body: { error: "tournament_circuit_requires_organizer" },
      });
    },
  );

  it("lets an organizer create a circuit without admin access", async () => {
    await signIn("organizer", false, [AccountRole.ORGANIZER.value]);
    const created = await send("/tournament-circuits", circuitBody);
    expect(created.status).toBe(201);
    expect(created.body.createdBy).toBe(current?.account.id);
    expect(await send(`/tournament-circuits/${created.body.id}/cancel`, {})).toEqual({
      status: 403,
      body: { error: "tournament_circuit_requires_admin" },
    });
  });

  it("rejects malformed and invalid circuits with reasons", async () => {
    await signIn("admin", true);
    expect(
      (
        await send("/tournament-circuits", {
          ...circuitBody,
          schedule: { cadence: "yearly", slots: [] },
        })
      ).status,
    ).toBe(400);
    const invalid = await send("/tournament-circuits", {
      ...circuitBody,
      timeZone: "Nowhere/City",
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.reasons).toEqual([{ code: "time_zone_invalid", field: "timeZone" }]);
  });

  it("creates a circuit with default scoring and serves it publicly with its schedule", async () => {
    await signIn("admin", true);
    const created = await send("/tournament-circuits", circuitBody);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Weekend Circuit",
      status: "active",
      leadTimeMs: 48 * 3_600_000,
      participationPoints: 1,
      nextOccurrenceAt: Date.parse("2026-11-07T21:00:00Z"),
      upcoming: [Date.parse("2026-11-07T21:00:00Z"), Date.parse("2026-11-14T21:00:00Z")],
      scoringLocked: false,
    });

    current = undefined;
    const list = await send("/tournament-circuits");
    expect(list.body.items.map((item) => item.id)).toEqual([created.body.id]);
    const leaderboard = await send(`/tournament-circuits/${created.body.id}/leaderboard`);
    expect(leaderboard.body).toEqual({
      circuitId: created.body.id,
      final: false,
      entries: [],
      mine: null,
      page: 1,
      total: 0,
    });
    expect((await send("/tournament-circuits/not-a-uuid")).status).toBe(404);
    expect((await send(`/tournament-circuits/${created.body.id}/leaderboard?page=0`)).status).toBe(400);
  });

  it("cancels a circuit together with its events that have not started", async () => {
    await signIn("admin", true);
    const created = await send("/tournament-circuits", circuitBody);
    await scheduleCircuitTournaments({
      accounts,
      now: Date.parse("2026-11-06T12:00:00Z"),
    });

    const cancelled = await send(`/tournament-circuits/${created.body.id}/cancel`, {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.tournaments.map((event) => event.status)).toEqual(["cancelled"]);
    expect((await send(`/tournament-circuits/${created.body.id}/cancel`, {})).status).toBe(409);
  });
});
