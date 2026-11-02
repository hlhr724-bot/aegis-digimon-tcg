import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore, type AuthSession } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

import { installTournamentResultRoutes } from "#api/tournaments/results/installTournamentResultRoutes";

const NOW = Date.UTC(2026, 9, 26);

let accounts: AccountStore;
let server: Server;
let base: string;
let current: AuthSession | undefined;

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  await accounts.ensureReady();
  current = undefined;
  const app = express();
  installTournamentResultRoutes({ app, accounts, session: async () => current });
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

async function createTournament(organizerId: string): Promise<string> {
  const tournament = await accounts.createTournament(organizerId, {
    name: "Weekly Cup",
    block: "BT10",
    startsAt: NOW - 3_600_000,
    maxPlayers: 8,
    allowBots: false,
    bestOf: 1,
    rules: buildTournamentRules({ bestOf: 1 }),
  });
  return tournament.id;
}

async function saveExport(tournamentId: string): Promise<void> {
  await accounts.pool.query("UPDATE tournaments SET status='finished' WHERE id=$1", [tournamentId]);
  await accounts.pool.query(
    "INSERT INTO tournament_result_exports (tournament_id, schema_version, payload, created_at) VALUES ($1,1,$2,$3)",
    [tournamentId, JSON.stringify({ schemaVersion: 1, event: { id: tournamentId } }), NOW],
  );
}

describe("tournament export route", () => {
  it("requires a session", async () => {
    const response = await fetch(`${base}/tournaments/${randomUUID()}/export`);

    expect(response.status).toBe(401);
  });

  it("refuses everyone but the organizer and administrators", async () => {
    const organizer = await accounts.accountForIdentity("email", "organizer", "Organizer");
    const player = await accounts.accountForIdentity("email", "player", "Player");
    const tournamentId = await createTournament(organizer.id);
    await saveExport(tournamentId);
    current = { account: player } as AuthSession;

    const response = await fetch(`${base}/tournaments/${tournamentId}/export`);

    expect(response.status).toBe(403);
  });

  it("returns the saved export to the organizer and to administrators", async () => {
    const organizer = await accounts.accountForIdentity("email", "organizer", "Organizer");
    const admin = await accounts.accountForIdentity("email", "admin", "Admin");
    const tournamentId = await createTournament(organizer.id);
    await saveExport(tournamentId);

    for (const account of [organizer, { ...admin, isAdmin: true }]) {
      current = { account } as AuthSession;
      const response = await fetch(`${base}/tournaments/${tournamentId}/export`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ schemaVersion: 1, event: { id: tournamentId } });
    }
  });

  it("answers 404 until the event is finished and for unknown events", async () => {
    const organizer = await accounts.accountForIdentity("email", "organizer", "Organizer");
    const tournamentId = await createTournament(organizer.id);
    current = { account: organizer } as AuthSession;

    const pending = await fetch(`${base}/tournaments/${tournamentId}/export`);
    const unknown = await fetch(`${base}/tournaments/${randomUUID()}/export`);
    const malformed = await fetch(`${base}/tournaments/not-a-uuid/export`);

    expect(pending.status).toBe(404);
    expect(await pending.json()).toEqual({ error: "tournament_export_not_ready" });
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
  });
});
