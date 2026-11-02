import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TrophyAward } from "@aegis/shared/achievements/TrophyAward";
import { TrophyTier } from "@aegis/shared/achievements/TrophyTier";
import { AccountStore, type AuthSession } from "#api/accounts/AccountStore";
import { installAchievementRoutes } from "#api/achievements/installAchievementRoutes";

import { createMemoryPool } from "#api/db/memoryPool.fixture";

let accounts: AccountStore;
let server: Server;
let base: string;
let current: AuthSession | undefined;

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  await accounts.ensureReady();
  current = undefined;
  const app = express();
  installAchievementRoutes({ app, accounts, session: async () => current });
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

describe("achievement routes", () => {
  it("requires authentication to read trophies", async () => {
    const response = await fetch(`${base}/achievements/trophies`);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns only the signed-in player's trophies", async () => {
    const player = await accounts.accountForIdentity("email", "player", "Player");
    const other = await accounts.accountForIdentity("email", "other", "Other");
    const tournament = await accounts.createTournament(player.id, {
      name: "Lightning Cup",
      block: "BT10",
      startsAt: 1_800_000_000_000,
      maxPlayers: 16,
      allowBots: true,
      bestOf: 1,
      rules: buildTournamentRules({ bestOf: 1 }),
    });
    for (const accountId of [player.id, other.id]) {
      await accounts.pool.query(
        `INSERT INTO player_trophies (account_id, source_kind, source_key, award, tier, tournament_id, awarded_at)
         VALUES ($1,'tournament',$4,$2,$3,$4,1500)`,
        [accountId, TrophyAward.TOURNAMENT_CHAMPION.value, TrophyTier.GOLD.value, tournament.id],
      );
    }
    current = { account: player } as AuthSession;

    const response = await fetch(`${base}/achievements/trophies`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          award: TrophyAward.TOURNAMENT_CHAMPION.value,
          tier: TrophyTier.GOLD.value,
          source: { kind: "tournament", tournamentId: tournament.id, name: "Lightning Cup" },
          awardedAt: 1500,
        },
      ],
    });
  });
});
