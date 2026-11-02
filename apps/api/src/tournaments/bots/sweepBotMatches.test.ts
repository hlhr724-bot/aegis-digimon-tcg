import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import { createMemoryPool } from "../../db/memoryPool.fixture.js";

import type { BotDriveOutcome, BotMatchDriver } from "./BotMatchDriver.js";
import { createBotMatchSweep } from "./sweepBotMatches.js";

/**
 * The reconciliation pass that makes bot matches happen without anybody watching. The driver is a
 * stub here on purpose — what this file is about is WHICH matches get nudged and with what clock,
 * not what the nudge does; `BotMatchDriver.test.ts` plays the real games.
 */

let accounts: AccountStore;
let tournamentId: string;
let advanceMatch: ReturnType<typeof vi.fn>;
let sweep: (now: number) => Promise<number>;

function stubDriver(): BotMatchDriver {
  return { advanceMatch } as unknown as BotMatchDriver;
}

async function createTournament(overrides: { bestOf?: 1 | 3; status?: string } = {}): Promise<void> {
  const organizer = await accounts.accountForIdentity("discord", `org-${randomUUID()}`, "Organizer");
  const bestOf = overrides.bestOf ?? 1;
  const tournament = await accounts.createTournament(organizer.id, {
    name: "Lightning Cup",
    block: "BT10",
    startsAt: 1,
    maxPlayers: 8,
    allowBots: true,
    bestOf,
    rules: buildTournamentRules({ bestOf: bestOf }),
  });
  tournamentId = tournament.id;
  await accounts.pool.query("UPDATE tournaments SET status=$1 WHERE id=$2", [
    overrides.status ?? "in_progress",
    tournamentId,
  ]);
}

async function addParticipant(kind: "human" | "bot"): Promise<string> {
  const id = randomUUID();
  const accountId =
    kind === "human" ? (await accounts.accountForIdentity("discord", id, `P${id.slice(0, 6)}`)).id : null;
  await accounts.pool.query(
    "INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, created_at) VALUES ($1,$2,$3,$4,'X','active',1)",
    [id, tournamentId, kind, accountId],
  );
  return id;
}

async function addMatch(seats: [string, string], status = "pending"): Promise<string> {
  const id = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, round, position, status, player0_participant_id, player1_participant_id)
     VALUES ($1,$2,1,$3,$4,$5,$6)`,
    [id, tournamentId, Math.floor(Math.random() * 1000), status, seats[0], seats[1]],
  );
  return id;
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  advanceMatch = vi.fn<() => Promise<BotDriveOutcome>>(async () => ({ kind: "waiting_for_opponent" }));
  sweep = createBotMatchSweep({ accounts, driver: async () => stubDriver() });
  await createTournament();
});

describe("which matches get nudged", () => {
  it("nudges a match with a bot in it", async () => {
    const matchId = await addMatch([await addParticipant("human"), await addParticipant("bot")]);
    await sweep(1);
    expect(advanceMatch).toHaveBeenCalledTimes(1);
    expect(advanceMatch.mock.calls[0]![0]).toMatchObject({ matchId, tournamentId, winsRequired: 1 });
  });

  it("nudges a bot-versus-bot match exactly once, not once per bot", async () => {
    await addMatch([await addParticipant("bot"), await addParticipant("bot")]);
    await sweep(1);
    expect(advanceMatch).toHaveBeenCalledTimes(1);
  });

  it("leaves a match between two people alone", async () => {
    await addMatch([await addParticipant("human"), await addParticipant("human")]);
    await sweep(1);
    expect(advanceMatch).not.toHaveBeenCalled();
  });

  it("leaves a match that is not open alone", async () => {
    const bot = await addParticipant("bot");
    await addMatch([await addParticipant("human"), bot], "finished");
    await addMatch([await addParticipant("human"), bot], "waiting");
    await sweep(1);
    expect(advanceMatch).not.toHaveBeenCalled();
  });

  it("leaves an event that is not running alone", async () => {
    await createTournament({ status: "finished" });
    await addMatch([await addParticipant("human"), await addParticipant("bot")]);
    await sweep(1);
    expect(advanceMatch).not.toHaveBeenCalled();
  });
});

describe("what it nudges with", () => {
  it("takes the clock from the tournament's frozen ruleset", async () => {
    await createTournament({ bestOf: 3 });
    await addMatch([await addParticipant("human"), await addParticipant("bot")]);
    await sweep(1);
    expect(advanceMatch.mock.calls[0]![0]).toMatchObject({
      winsRequired: 2,
      // Round clock plus overtime: the deadline this drives is when the confrontation is decided,
      // which the manual puts after the extra turns, not when the main clock stops.
      seriesDurationMs:
        buildTournamentRules({ bestOf: 3 }).match.topCutDurationMs! +
        buildTournamentRules({ bestOf: 3 }).match.overtimeMs,
    });
  });
});

describe("isolation", () => {
  it("carries on after one match fails, and counts only what it advanced", async () => {
    const bot = await addParticipant("bot");
    await addMatch([await addParticipant("human"), bot]);
    await addMatch([await addParticipant("human"), bot]);
    advanceMatch
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ kind: "seated", series: {} } as BotDriveOutcome);
    // `logError` writes straight to stderr rather than through console.
    const logged = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(await sweep(1)).toBe(1);
    expect(advanceMatch).toHaveBeenCalledTimes(2);
    expect(logged.mock.calls.map(String).join("")).toContain("TOURNAMENT_BOT");
    logged.mockRestore();
  });

  it("does nothing at all, and builds no driver, when nothing is waiting", async () => {
    const build = vi.fn<() => Promise<BotMatchDriver>>(async () => stubDriver());
    expect(await createBotMatchSweep({ accounts, driver: build })(1)).toBe(0);
    expect(build).not.toHaveBeenCalled();
  });
});
