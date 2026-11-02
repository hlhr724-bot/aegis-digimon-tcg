import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { TrophyStore } from "#api/achievements/TrophyStore";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { inProcessTournamentLock } from "../participants/index.js";
import { EliminationStore, type BracketView, type EliminationMatch } from "./EliminationStore.js";

/**
 * The program's single-elimination bracket over pg-mem.
 *
 * Everything here is asserted through the store's own read side (`bracket`, `ledger`) or through
 * `player_stats`, never by reconstructing the SQL, so a change of storage that preserves behavior
 * keeps these green.
 */

let accounts: AccountStore;
let elimination: EliminationStore;
let organizer: string;
let tournamentId: string;

const DECK = { deckId: "d", name: "Deck", mainDeck: ["BT1-001"], eggDeck: [], revision: 1 };

async function addHuman(name: string): Promise<string> {
  const account = await accounts.accountForIdentity("discord", name, name);
  const id = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, created_at)
     VALUES ($1,$2,'human',$3,$4,'active',$5,$6)`,
    [id, tournamentId, account.id, name, JSON.stringify(DECK), Date.now()],
  );
  return id;
}

async function addBot(name: string): Promise<string> {
  const id = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, created_at, bot_profile, bot_deck_version)
     VALUES ($1,$2,'bot',NULL,$3,'active',$4,$5,'balanced','deck@1')`,
    [id, tournamentId, name, JSON.stringify(DECK), Date.now()],
  );
  return id;
}

function openMatches(bracket: BracketView): EliminationMatch[] {
  return bracket.matches.filter((match) => match.status === "pending");
}

/** Resolves every open confrontation by handing the win to seat 0, round after round. */
async function playOut(seatChoice: (match: EliminationMatch) => 0 | 1 = () => 0): Promise<BracketView> {
  for (let guard = 0; guard < 10; guard += 1) {
    const bracket = (await elimination.bracket(tournamentId))!;
    const open = openMatches(bracket);
    if (open.length === 0) return bracket;
    for (const match of open)
      await elimination.resolveMatch({ matchId: match.id, winnerSeat: seatChoice(match), reason: "series_won" });
  }
  throw new Error("bracket did not settle");
}

async function statsOf(accountId: string): Promise<Record<string, number>> {
  const row = (await accounts.pool.query("SELECT * FROM player_stats WHERE account_id=$1", [accountId])).rows[0];
  return (row ?? {}) as Record<string, number>;
}

type Fixture = { accounts: AccountStore; elimination: EliminationStore; organizer: string; tournamentId: string };

/** One empty Lightning Cup, built once and restored before each test. */
const fixtureFor = snapshotFixtures<Fixture>();

/**
 * Assigns the file's module-level bindings rather than shadowing them, so the helpers and
 * assertions below read the same instances the snapshot restores.
 */
async function buildFixture(pool: Pool): Promise<Fixture> {
  accounts = new AccountStore(pool);
  elimination = new EliminationStore(accounts, inProcessTournamentLock());
  organizer = (await accounts.accountForIdentity("discord", "organizer", "Organizer")).id;
  const tournament = await accounts.createTournament(organizer, {
    name: "Lightning Cup",
    block: "BT10",
    startsAt: 1,
    maxPlayers: 8,
    allowBots: true,
  });
  return { accounts, elimination, organizer, tournamentId: tournament.id };
}

beforeEach(async () => {
  ({ accounts, elimination, organizer, tournamentId } = await fixtureFor("default", buildFixture));
});

describe("drawing the bracket", () => {
  it("runs a three-participant field as a four-slot bracket with one bye", async () => {
    for (const name of ["a", "b", "c"]) await addHuman(name);
    const created = await elimination.createBracket({ tournamentId });
    expect(created.ok).toBe(true);
    const bracket = (created as { value: BracketView }).value;

    expect(bracket.size).toBe(4);
    expect(bracket.rounds).toBe(2);
    expect(bracket.matches).toHaveLength(3);
    expect(bracket.matches.filter((match) => match.status === "bye")).toHaveLength(1);
    // The bye is already carried into round 2, which is therefore waiting on one confrontation.
    const second = bracket.matches.find((match) => match.round === 2)!;
    expect(second.seats.filter((seat) => seat.participantId)).toHaveLength(1);
    expect(second.status).toBe("waiting");
  });

  it("needs no bye at all for a four-participant field", async () => {
    for (const name of ["a", "b", "c", "d"]) await addHuman(name);
    const bracket = (await elimination.createBracket({ tournamentId })) as { value: BracketView };
    expect(bracket.value.matches.filter((match) => match.status === "bye")).toHaveLength(0);
    expect(openMatches(bracket.value)).toHaveLength(2);
  });

  it("runs five participants as eight slots with three byes", async () => {
    for (const name of ["a", "b", "c", "d", "e"]) await addHuman(name);
    const bracket = (await elimination.createBracket({ tournamentId })) as { value: BracketView };
    expect(bracket.value.size).toBe(8);
    expect(bracket.value.matches.filter((match) => match.status === "bye")).toHaveLength(3);
    // One real first-round confrontation, plus the round-2 pairing that two byes already filled.
    expect(openMatches(bracket.value)).toHaveLength(2);
  });

  it("runs six participants as eight slots with two byes", async () => {
    for (const name of ["a", "b", "c", "d", "e", "f"]) await addHuman(name);
    const bracket = (await elimination.createBracket({ tournamentId })) as { value: BracketView };
    expect(bracket.value.size).toBe(8);
    expect(bracket.value.matches.filter((match) => match.status === "bye")).toHaveLength(2);
    // Two real first-round confrontations, and NO playable round-2 match: the two byes go to seeds
    // 1 and 2, who are placed in opposite halves, so each waits on a first-round winner. (Before
    // the seeded placement landed, both byes fell into one round-2 slot and it opened immediately —
    // which is precisely the mis-seeding that would have had 1 and 2 meet a round early.)
    expect(openMatches(bracket.value)).toHaveLength(2);
  });

  it("refuses a field of one", async () => {
    await addHuman("a");
    expect(await elimination.createBracket({ tournamentId })).toEqual({ ok: false, reason: "field_too_small" });
  });

  it("refuses a tournament that is not single elimination", async () => {
    await accounts.pool.query("UPDATE tournaments SET structure='swiss' WHERE id=$1", [tournamentId]);
    expect(await elimination.createBracket({ tournamentId })).toEqual({ ok: false, reason: "not_single_elimination" });
  });

  it("never redraws a bracket it already published", async () => {
    for (const name of ["a", "b", "c", "d", "e"]) await addHuman(name);
    const first = (await elimination.createBracket({ tournamentId })) as { value: BracketView };
    await addHuman("late");
    const second = (await elimination.createBracket({ tournamentId })) as { value: BracketView };
    expect(second.value.matches).toEqual(first.value.matches);
    expect(second.value.size).toBe(first.value.size);
  });

  it("persists the seed so the same draw is reproducible", async () => {
    for (const name of ["a", "b", "c", "d"]) await addHuman(name);
    const bracket = (await elimination.createBracket({ tournamentId })) as { value: BracketView };
    expect(bracket.value.bracketSeed).toHaveLength(64);
    expect((await elimination.bracket(tournamentId))?.bracketSeed).toBe(bracket.value.bracketSeed);
  });

  it("counts one tournament entry per human and none for a bot", async () => {
    const alice = await accounts.accountForIdentity("discord", "a", "a");
    await addHuman("a");
    await addHuman("b");
    await addBot("Bot One");
    await addBot("Bot Two");
    await elimination.createBracket({ tournamentId });
    expect((await statsOf(alice.id)).tournaments_played).toBe(1);
    expect((await accounts.pool.query("SELECT COUNT(*) count FROM player_stats")).rows[0]).toEqual({ count: 2 });
  });
});

describe("advancing", () => {
  it("produces exactly one champion and finishes the tournament once", async () => {
    for (const name of ["a", "b", "c", "d"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    const settled = await playOut();

    expect(settled.championParticipantId).not.toBeNull();
    expect((await accounts.tournament(tournamentId))?.status).toBe("finished");
    const champion = settled.matches.find((match) => match.round === settled.rounds)!;
    const championAccount = champion.seats.find(
      (seat) => seat.participantId === settled.championParticipantId,
    )!.accountId!;
    expect((await statsOf(championAccount)).tournaments_won).toBe(1);
    expect((await new TrophyStore(accounts).getTrophies(championAccount)).items).toMatchObject([
      { award: "tournament_champion", tier: "gold", source: { tournamentId } },
    ]);
  });

  it("does not award the championship twice when the final is resolved again", async () => {
    for (const name of ["a", "b"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    const settled = await playOut();
    const final = settled.matches.find((match) => match.round === settled.rounds)!;
    await elimination.resolveMatch({ matchId: final.id, winnerSeat: 0, reason: "series_won" });
    await elimination.resolveMatch({ matchId: final.id, winnerSeat: 1, reason: "series_won" });

    const after = (await elimination.bracket(tournamentId))!;
    expect(after.championParticipantId).toBe(settled.championParticipantId);
    const championAccount = final.seats.find(
      (seat) => seat.participantId === settled.championParticipantId,
    )!.accountId!;
    expect((await statsOf(championAccount)).tournaments_won).toBe(1);
    expect((await new TrophyStore(accounts).getTrophies(championAccount)).items).toMatchObject([
      { award: "tournament_champion", tier: "gold", source: { tournamentId } },
    ]);
  });

  it("never rewrites a pairing that was already published", async () => {
    for (const name of ["a", "b", "c", "d"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    const before = (await elimination.bracket(tournamentId))!;
    const first = openMatches(before)[0]!;
    await elimination.resolveMatch({ matchId: first.id, winnerSeat: 0, reason: "series_won" });
    // A second, contradictory report changes nothing.
    await elimination.resolveMatch({ matchId: first.id, winnerSeat: 1, reason: "series_won" });

    const after = (await elimination.bracket(tournamentId))!;
    const resolved = after.matches.find((match) => match.id === first.id)!;
    expect(resolved.winnerParticipantId).toBe(first.seats[0].participantId);
    // The other first-round pairing is untouched.
    const other = openMatches(before)[1]!;
    expect(after.matches.find((match) => match.id === other.id)).toEqual(other);
  });

  it("leaves the bracket where it is when a series ends without a winner", async () => {
    for (const name of ["a", "b"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    const before = (await elimination.bracket(tournamentId))!;
    await elimination.onSeriesResolved({
      id: "series-1",
      matchId: openMatches(before)[0]!.id,
      tournamentId,
      participantAccountIds: [null, null],
      participantIds: [null, null],
      winsRequired: 2,
      wins: [1, 1],
      status: "needs_organizer_decision",
      startedAt: 0,
      seriesDeadlineAt: null,
      officialResult: null,
      resolutionReason: "elimination_tie_needs_state_tiebreak",
      resolvedAt: 1,
      version: 1,
      games: [],
    });
    expect(await elimination.bracket(tournamentId)).toEqual(before);
  });
});

/**
 * `tournament_matches` is shared with the Swiss program. A bracket that treated every row of a
 * tournament as its own would advance — or overwrite — a published Swiss pairing, which is one
 * nullable column away from silent corruption.
 */
describe("staying inside its own phase", () => {
  it("never touches a match that belongs to another phase", async () => {
    for (const name of ["a", "b"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    const swissPhase = randomUUID();
    const swissMatch = randomUUID();
    await accounts.pool.query(
      "INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, created_at) VALUES ($1,$2,'swiss',9,'running',1)",
      [swissPhase, tournamentId],
    );
    const participants = (
      await accounts.pool.query<{ id: string; account_id: string }>(
        "SELECT id, account_id FROM tournament_participants WHERE tournament_id=$1 ORDER BY created_at",
        [tournamentId],
      )
    ).rows;
    await accounts.pool.query(
      `INSERT INTO tournament_matches (id, tournament_id, phase_id, round, position, status, player0_participant_id, player0_account_id, player1_participant_id, player1_account_id)
       VALUES ($1,$2,$3,1,5,'pending',$4,$5,$6,$7)`,
      [
        swissMatch,
        tournamentId,
        swissPhase,
        participants[0]!.id,
        participants[0]!.account_id,
        participants[1]!.id,
        participants[1]!.account_id,
      ],
    );

    await elimination.resolveMatch({ matchId: swissMatch, winnerSeat: 0, reason: "series_won" });
    expect(
      (
        await accounts.pool.query<{ status: string; winner_participant_id: string | null }>(
          "SELECT status, winner_participant_id FROM tournament_matches WHERE id=$1",
          [swissMatch],
        )
      ).rows[0],
    ).toEqual({ status: "pending", winner_participant_id: null });
    // And the Swiss row is invisible to the bracket's own reads.
    expect((await elimination.bracket(tournamentId))!.matches.some((match) => match.id === swissMatch)).toBe(false);
  });

  it("takes the next phase slot rather than colliding with one that exists", async () => {
    await accounts.pool.query(
      "INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, created_at) VALUES ($1,$2,'swiss',0,'finished',1)",
      [randomUUID(), tournamentId],
    );
    for (const name of ["a", "b"]) await addHuman(name);
    const created = await elimination.createBracket({ tournamentId });
    expect(created.ok).toBe(true);
    const order = (
      await accounts.pool.query<{ phase_order: number }>(
        "SELECT phase_order FROM tournament_phases WHERE tournament_id=$1 AND kind='single_elimination'",
        [tournamentId],
      )
    ).rows[0];
    expect(Number(order?.phase_order)).toBe(1);
  });
});

describe("stats segregation", () => {
  it("records a human-versus-human confrontation once, as a human opponent", async () => {
    const alice = await accounts.accountForIdentity("discord", "a", "a");
    await addHuman("a");
    await addHuman("b");
    await elimination.createBracket({ tournamentId });
    await playOut();

    const records = (await accounts.pool.query("SELECT opponent_kind, mode FROM match_records")).rows;
    expect(records).toEqual([{ opponent_kind: "human", mode: "tournament" }]);
    const stats = await statsOf(alice.id);
    expect((stats.tournament_wins ?? 0) + (stats.tournament_losses ?? 0)).toBe(1);
  });

  it("flags a bot confrontation and keeps it out of the competitive counters", async () => {
    const alice = await accounts.accountForIdentity("discord", "a", "a");
    await addHuman("a");
    await addBot("Agumon Unit");
    await elimination.createBracket({ tournamentId });
    await playOut();

    const record = (
      await accounts.pool.query("SELECT opponent_kind, player0_account_id, player1_account_id FROM match_records")
    ).rows[0];
    expect(record).toEqual({ opponent_kind: "bot", player0_account_id: alice.id, player1_account_id: null });
    const stats = await statsOf(alice.id);
    expect(stats.tournament_wins).toBe(0);
    expect(stats.tournament_losses).toBe(0);
    expect(stats.tournament_draws).toBe(0);
    // The match still shows up in the player's own history, named rather than dropped.
    expect((await accounts.matchHistory(alice.id, { page: 1, limit: 25 })).matches).toHaveLength(1);
  });

  it("records nothing at all for a bot-versus-bot confrontation", async () => {
    await addBot("Agumon Unit");
    await addBot("Gabumon Unit");
    await elimination.createBracket({ tournamentId });
    await playOut();
    expect((await accounts.pool.query("SELECT COUNT(*) count FROM match_records")).rows[0]).toEqual({ count: 0 });
  });

  it("projects a ledger that names each opponent's kind", async () => {
    await addHuman("a");
    await addBot("Agumon Unit");
    await elimination.createBracket({ tournamentId });
    await playOut();

    const ledger = await elimination.ledger(tournamentId);
    expect(ledger).toHaveLength(2);
    expect(ledger.map((entry) => entry.opponentKind).sort()).toEqual(["bot", "human"]);
    expect(ledger.map((entry) => entry.outcome).sort()).toEqual(["loss", "win"]);
  });

  it("records a human loss to a bot as a LOSS, not a draw", async () => {
    const alice = await accounts.accountForIdentity("discord", "a", "a");
    await addHuman("a");
    await addBot("Agumon Unit");
    await elimination.createBracket({ tournamentId });
    // Seat 1 is the bot in this draw or it is not; hand the win to whichever seat has no account.
    const bracket = (await elimination.bracket(tournamentId))!;
    const final = openMatches(bracket)[0]!;
    const botSeat = final.seats[0].accountId ? 1 : 0;
    await elimination.resolveMatch({ matchId: final.id, winnerSeat: botSeat, reason: "series_won" });

    const profile = await accounts.profile(alice.id);
    const matches = (await accounts.matchHistory(alice.id, { page: 1, limit: 25 })).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ result: "loss", opponentKind: "bot", opponentName: "Agumon Unit" });
    // Still not a competitive counter.
    expect(profile.stats.tournamentLosses).toBe(0);
  });

  it("names the bot rather than erasing it to a placeholder", async () => {
    const alice = await accounts.accountForIdentity("discord", "a", "a");
    await addHuman("a");
    await addBot("Gabumon Unit");
    await elimination.createBracket({ tournamentId });
    await playOut();
    expect((await accounts.matchHistory(alice.id, { page: 1, limit: 25 })).matches[0]?.opponentName).toBe(
      "Gabumon Unit",
    );
  });

  it("writes the ledger table standings project from", async () => {
    for (const name of ["a", "b", "c"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    await playOut();

    const rows = (
      await accounts.pool.query<{ outcome: string; round_number: number; opponent_kind: string | null }>(
        "SELECT outcome, round_number, opponent_kind FROM tournament_result_ledger WHERE tournament_id=$1 ORDER BY round_number, outcome",
        [tournamentId],
      )
    ).rows;
    // Round 1: one bye plus a win and a loss. Round 2: a win and a loss.
    expect(
      rows
        .filter((row) => row.round_number === 1)
        .map((row) => row.outcome)
        .sort(),
    ).toEqual(["bye", "loss", "win"]);
    expect(
      rows
        .filter((row) => row.round_number === 2)
        .map((row) => row.outcome)
        .sort(),
    ).toEqual(["loss", "win"]);
    expect(rows.find((row) => row.outcome === "bye")?.opponent_kind).toBeNull();
  });

  it("counts a result once, however many times the resolution is announced", async () => {
    for (const name of ["a", "b"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    const bracket = (await elimination.bracket(tournamentId))!;
    const final = openMatches(bracket)[0]!;
    for (let attempt = 0; attempt < 3; attempt += 1)
      await elimination.resolveMatch({ matchId: final.id, winnerSeat: 0, reason: "series_won" });
    expect(
      (
        await accounts.pool.query("SELECT COUNT(*) count FROM tournament_result_ledger WHERE tournament_id=$1", [
          tournamentId,
        ])
      ).rows[0],
    ).toEqual({ count: 2 });
  });

  it("records a bye in the ledger with no opponent", async () => {
    for (const name of ["a", "b", "c"]) await addHuman(name);
    await elimination.createBracket({ tournamentId });
    const ledger = await elimination.ledger(tournamentId);
    expect(ledger.filter((entry) => entry.outcome === "bye")).toHaveLength(1);
    expect(ledger.find((entry) => entry.outcome === "bye")).toMatchObject({ opponentId: null, opponentKind: null });
  });
});

it("holds each elimination round until manual release and refuses early presence", async () => {
  await accounts.pool.query("UPDATE tournaments SET round_start_mode='manual' WHERE id=$1", [tournamentId]);
  await addHuman("Alice");
  await addHuman("Bob");
  await addHuman("Carol");
  await addHuman("Dave");
  const created = await elimination.createBracket({ tournamentId });
  expect(created.ok).toBe(true);
  expect(openMatches((await elimination.bracket(tournamentId))!)).toHaveLength(0);
  expect(await elimination.startNextRound(tournamentId)).toBe(true);
  const first = openMatches((await elimination.bracket(tournamentId))!);
  expect(first).toHaveLength(2);
  expect(await elimination.startNextRound(tournamentId)).toBe(false);
  for (const match of first) {
    await elimination.resolveMatch({ matchId: match.id, winnerSeat: 0, reason: "series_won" });
  }
  expect(openMatches((await elimination.bracket(tournamentId))!)).toHaveLength(0);
  expect(await elimination.startNextRound(tournamentId)).toBe(true);
  expect(openMatches((await elimination.bracket(tournamentId))!)).toHaveLength(1);
});

it("recovers automatic bracket release after a mode change and rechecks manual mode", async () => {
  await accounts.pool.query("UPDATE tournaments SET round_start_mode='manual' WHERE id=$1", [tournamentId]);
  await addHuman("Alice");
  await addHuman("Bob");
  await elimination.createBracket({ tournamentId });
  expect(await elimination.startNextRound(tournamentId, 1000, true)).toBe(false);
  await accounts.pool.query("UPDATE tournaments SET round_start_mode='automatic' WHERE id=$1", [tournamentId]);
  expect(await elimination.sweepAutomaticRounds(2000)).toBe(1);
  expect(await elimination.sweepAutomaticRounds(2000)).toBe(0);
});

it("starts attendance deadlines at actual publication for automatic and manually released bracket rounds", async () => {
  const rules = buildTournamentRules({ bestOf: 3 });
  await accounts.pool.query("UPDATE tournaments SET rules_snapshot=$1 WHERE id=$2", [
    JSON.stringify(rules),
    tournamentId,
  ]);
  await addHuman("Alice");
  await addHuman("Bob");
  await addHuman("Carol");
  await addHuman("Dave");
  await elimination.createBracket({ tournamentId, now: 1000 });
  const first = openMatches((await elimination.bracket(tournamentId))!);
  for (const match of first) {
    const row = (await accounts.pool.query("SELECT join_deadline_at FROM tournament_matches WHERE id=$1", [match.id]))
      .rows[0];
    expect(Number(row.join_deadline_at)).toBe(1000 + rules.attendance.joinGraceMs);
  }
  await accounts.pool.query("UPDATE tournaments SET round_start_mode='manual' WHERE id=$1", [tournamentId]);
  for (const match of first) {
    await elimination.resolveMatch({ matchId: match.id, winnerSeat: 0, reason: "series_won", now: 2000 });
  }
  const final = (await elimination.bracket(tournamentId))!.matches.find((match) => match.round === 2)!;
  expect(
    (await accounts.pool.query("SELECT join_deadline_at FROM tournament_matches WHERE id=$1", [final.id])).rows[0]
      .join_deadline_at,
  ).toBeNull();
  expect(await elimination.startNextRound(tournamentId, 120000)).toBe(true);
  expect(
    Number(
      (await accounts.pool.query("SELECT join_deadline_at FROM tournament_matches WHERE id=$1", [final.id])).rows[0]
        .join_deadline_at,
    ),
  ).toBe(120000 + rules.attendance.joinGraceMs);
});
