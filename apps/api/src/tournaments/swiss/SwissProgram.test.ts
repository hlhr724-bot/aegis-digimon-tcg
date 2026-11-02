import { TrophyStore } from "#api/achievements/TrophyStore";
import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import type { PhaseView, StandingsRow } from "@aegis/shared";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import { createMemoryPool } from "../../db/memoryPool.fixture.js";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { RED_DECK } from "../../engine/testDecks.js";
import { pairSwissRound } from "../pairing/index.js";
import { ParticipantStore } from "../participants/index.js";

import { SeriesStore } from "../series/index.js";
import { computeStandings } from "../standings/index.js";
import { standingsConfig, SwissProgram } from "./SwissProgram.js";

const T0 = 1_000_000;
const JOIN_GRACE_MS = buildTournamentRules({ bestOf: 3 }).attendance.joinGraceMs;

type Player = { accountId: string; participantId: string; name: string };

type Fixture = {
  accounts: AccountStore;
  participants: ParticipantStore;
  series: SeriesStore;
  swiss: SwissProgram;
  tournamentId: string;
  players: Player[];
  byAccount: Map<string, Player>;
  byParticipant: Map<string, Player>;
};

let fixture: Fixture;

/** One cache for this file: an arrangement is built once and restored for every test that reuses it. */
const fixtureFor = snapshotFixtures<Fixture>();

/**
 * A pool that records the transaction verb each connection ends on.
 *
 * Needed because **pg-mem does not implement ROLLBACK**: it applies the statements anyway, so a
 * rolled-back transaction is indistinguishable from a committed one by reading the data back. The
 * decision is still assertable even when its effect is not, so the atomicity tests below assert
 * that the module ISSUES `ROLLBACK` rather than that pg-mem honoured it. On real Postgres the
 * effect follows; on pg-mem the write survives and any assertion about the surviving rows would be
 * asserting the fake's bug rather than our behaviour.
 */
function recordingPool(): { pool: Pool; verbs: string[] } {
  const pool = createMemoryPool();
  const verbs: string[] = [];
  const connect = pool.connect.bind(pool);
  // The pool hands the SAME client back on a later connect, so wrapping on every connect would
  // stack wrappers and record one verb once per layer.
  const wrapped = new WeakSet<object>();
  pool.connect = (async () => {
    const client = await connect();
    if (!wrapped.has(client)) {
      wrapped.add(client);
      const query = client.query.bind(client);
      // oxlint-disable-next-line typescript/no-explicit-any -- mirrors pg's own overloaded signature
      client.query = ((text: any, ...rest: any[]) => {
        if (typeof text === "string" && ["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) verbs.push(text);
        return query(text, ...rest);
        // oxlint-disable-next-line typescript/no-explicit-any -- as above
      }) as any;
    }
    return client;
    // oxlint-disable-next-line typescript/no-explicit-any -- as above
  }) as any;
  return { pool, verbs };
}

/**
 * A Swiss event carried through the real registration flow: every player saves a legal deck,
 * registers, checks in, and the field is frozen by `closeCheckIn` — which is what leaves them
 * `active` and what the round count is frozen from.
 */
/**
 * Snapshot-backed when the caller takes the default pool. A caller that brings its own pool wants
 * that exact instance (the `recordingPool` atomicity cases read the verbs off it), so those build
 * from scratch.
 */
async function build(playerCount: number, options: { topCut?: boolean; pool?: Pool } = {}): Promise<Fixture> {
  if (options.pool) return buildOn(options.pool, playerCount, options.topCut === true);
  return fixtureFor(`swiss:${playerCount}:${options.topCut === true}`, (pool) =>
    buildOn(pool, playerCount, options.topCut === true),
  );
}

async function buildOn(pool: Pool, playerCount: number, topCut: boolean): Promise<Fixture> {
  const options = { topCut };
  const accounts = new AccountStore(pool);
  const participants = new ParticipantStore(accounts);
  const series = new SeriesStore(accounts);
  const swiss = new SwissProgram(accounts, series);

  const names = Array.from({ length: playerCount }, (_, index) => `Player${index + 1}`);
  const organizer = await accounts.accountForIdentity("discord", "organizer", "Organizer");
  const tournament = await accounts.createTournament(organizer.id, {
    name: "Swiss Cup",
    block: "BT10",
    startsAt: T0,
    maxPlayers: Math.max(playerCount, 8),
    structure: "swiss",
    bestOf: 3,
    topCutEnabled: options.topCut === true,
    rules: buildTournamentRules({ bestOf: 3 }),
  });

  for (const name of names) {
    const account = await accounts.accountForIdentity("discord", name.toLowerCase(), name);
    const deck = await accounts.saveDeck(account.id, {
      name: "Competitive",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    const registered = await participants.register({
      tournamentId: tournament.id,
      accountId: account.id,
      savedDeckId: deck.id,
      now: T0,
    });
    if (!registered.ok) throw new Error(`registration failed: ${registered.reason}`);
    const checkedIn = await participants.checkIn({ tournamentId: tournament.id, accountId: account.id, now: T0 });
    if (!checkedIn.ok) throw new Error(`check-in failed: ${checkedIn.reason}`);
  }

  const frozen = await participants.closeCheckIn({ tournamentId: tournament.id, now: T0 });
  if (!frozen.ok) throw new Error(`close check-in failed: ${frozen.reason}`);
  const players = frozen.value.map((participant) => ({
    accountId: participant.accountId!,
    participantId: participant.id,
    name: participant.displayName,
  }));
  return {
    accounts,
    participants,
    series,
    swiss,
    tournamentId: tournament.id,
    players,
    byAccount: new Map(players.map((player) => [player.accountId, player])),
    byParticipant: new Map(players.map((player) => [player.participantId, player])),
  };
}

async function start(topCut = false, playerCount = 4, pool?: Pool): Promise<PhaseView> {
  fixture = await build(playerCount, { topCut, pool });
  const started = await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
  if (!started.ok) throw new Error(`start failed: ${started.reason} ${started.detail ?? ""}`);
  return started.value;
}

async function currentPhase(): Promise<PhaseView> {
  return (await fixture.swiss.phaseViews(fixture.tournamentId))[0]!;
}

async function roundIdOf(number: number): Promise<string> {
  return (
    await fixture.accounts.pool.query<{ id: string }>(
      `SELECT r.id FROM tournament_rounds r JOIN tournament_phases p ON p.id=r.phase_id
       WHERE p.tournament_id=$1 AND r.number=$2`,
      [fixture.tournamentId, number],
    )
  ).rows[0]!.id;
}

type PlayedMatch = { matchId: string; accountIds: [string, string] };

async function playableMatches(roundNumber: number): Promise<PlayedMatch[]> {
  return (
    await fixture.accounts.pool.query<{ id: string; player0_account_id: string; player1_account_id: string }>(
      `SELECT id, player0_account_id, player1_account_id FROM tournament_matches
       WHERE tournament_id=$1 AND round=$2 AND status='pending' ORDER BY position`,
      [fixture.tournamentId, roundNumber],
    )
  ).rows.map((row) => ({
    matchId: row.id,
    accountIds: [row.player0_account_id, row.player1_account_id] as [string, string],
  }));
}

/**
 * Drives one confrontation through the real series module: both players arrive, then the winner
 * takes the two games a best-of-three needs. `winnerSeat` of `null` runs the clock out instead,
 * which is how a Swiss draw actually happens.
 */
async function resolveMatch(match: PlayedMatch, winnerSeat: 0 | 1 | null, now: number): Promise<void> {
  for (const accountId of match.accountIds)
    await fixture.series.markPresent({
      tournamentId: fixture.tournamentId,
      matchId: match.matchId,
      accountId,
      winsRequired: 2,
      seriesDurationMs: 2_700_000,
      now,
    });
  const seriesRecord = (await fixture.series.seriesForMatch(match.matchId))!;
  if (winnerSeat === null) {
    await fixture.series.resolveSeriesByDeadline({
      seriesId: seriesRecord.id,
      policy: { kind: "swiss", onTie: "draw" },
      now: seriesRecord.seriesDeadlineAt! + 1,
    });
    return;
  }
  for (let game = 0; game < 2; game += 1) {
    const roomId = `room-${match.matchId}-${game}`;
    const authorized = await fixture.series.authorizeNextGame({
      seriesId: seriesRecord.id,
      accountId: match.accountIds[0],
      now,
    });
    if (!authorized.ok) throw new Error(`authorization failed: ${authorized.reason}`);
    const gameId = authorized.value.gameId;
    // The room binding a real client would make through `claimGame`; the token round-trip is the
    // series module's own territory and is exercised by its suite, not re-litigated here.
    await fixture.accounts.pool.query("UPDATE tournament_games SET room_id=$1, status='playing' WHERE id=$2", [
      roomId,
      gameId,
    ]);
    await fixture.series.recordGameResult({
      gameId,
      roomId,
      outcome: { kind: "winner", winnerAccountId: match.accountIds[winnerSeat] },
      finishedAt: now + game + 1,
    });
  }
}

/**
 * Every match of a round decided, seat 0 winning unless `winners` says otherwise. A `null` entry
 * means that confrontation runs its clock out instead — note the index check rather than `??`,
 * since `null` is a meaningful instruction here and not an absent one.
 */
async function playRound(roundNumber: number, now: number, winners: (0 | 1 | null)[] = []): Promise<void> {
  const matches = await playableMatches(roundNumber);
  for (const [index, match] of matches.entries())
    await resolveMatch(match, index < winners.length ? winners[index]! : 0, now);
}

function rankOf(standings: StandingsRow[], participantId: string): number {
  return standings.find((row) => row.participantId === participantId)!.rank;
}

describe("SwissProgram start", () => {
  it("freezes the structure and publishes round 1 with join deadlines", async () => {
    const phase = await start(false, 4);
    expect(phase.kind).toBe("swiss");
    expect(phase.status).toBe("running");
    // Official table (manual §3.6): a field of 8 or fewer plays three rounds.
    expect(phase.plannedRounds).toBe(3);
    expect(phase.rounds).toHaveLength(1);
    expect(phase.rounds[0]!.status).toBe("published");
    expect(phase.rounds[0]!.publishedAt).toBe(T0);
    expect(phase.rounds[0]!.matches).toHaveLength(2);
    for (const match of phase.rounds[0]!.matches) expect(match.joinDeadlineAt).toBe(T0 + JOIN_GRACE_MS);

    const tournament = (await fixture.accounts.tournament(fixture.tournamentId))!;
    expect(tournament.status).toBe("in_progress");
    expect(tournament.topCutSize).toBeNull();
  });

  it("freezes the Top Cut size from the confirmed field when the flag is on", async () => {
    await start(true, 8);
    // A field of 8 or fewer cuts to nobody, which is a frozen 0 rather than a null.
    expect((await fixture.accounts.tournament(fixture.tournamentId))!.topCutSize).toBe(0);
  });

  it("is idempotent: a second start returns the same phase and republishes nothing", async () => {
    const first = await start(false, 4);
    const second = await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0 + 999);
    expect(second.ok && second.value.id).toBe(first.id);
    expect(second.ok && second.value.rounds).toHaveLength(1);
    expect((await playableMatches(1)).length).toBe(2);
  });

  it("refuses to start a Swiss phase over a field containing a bot", async () => {
    // Swiss pairs participants but SEATS accounts: the match row, the presence check and the game
    // authorization are all account-keyed, so an accountless seat has no way to be played. No
    // preset puts a bot in Swiss, which makes this a corrupted field the start must name rather
    // than pair around.
    fixture = await build(4);
    const bot = fixture.players[2]!;
    await fixture.accounts.pool.query("UPDATE tournament_participants SET kind='bot', account_id=NULL WHERE id=$1", [
      bot.participantId,
    ]);
    const started = await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    expect(started).toEqual({ ok: false, reason: "participant_without_account", detail: bot.participantId });
    // And nothing was published, so the organizer's fix starts from a clean field.
    expect(await fixture.swiss.phaseViews(fixture.tournamentId)).toEqual([]);
  });

  it("refuses a tournament that is not Swiss", async () => {
    fixture = await build(4);
    await fixture.accounts.pool.query("UPDATE tournaments SET structure='single_elimination' WHERE id=$1", [
      fixture.tournamentId,
    ]);
    const started = await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    expect(started.ok).toBe(false);
    expect(!started.ok && started.reason).toBe("not_swiss");
  });

  it("gives the bye to exactly one participant and ledgers it at publication", async () => {
    await start(false, 5);
    const byes = (
      await fixture.accounts.pool.query<{ pairing_reason: string; player0_account_id: string }>(
        "SELECT pairing_reason, player0_account_id FROM tournament_matches WHERE tournament_id=$1 AND status='bye'",
        [fixture.tournamentId],
      )
    ).rows;
    expect(byes).toHaveLength(1);
    expect(byes[0]!.pairing_reason).toBe("bye_no_prior_bye");
    expect(await playableMatches(1)).toHaveLength(2);

    const ledger = await fixture.swiss.ledger(fixture.tournamentId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ outcome: "bye", opponentId: null, opponentKind: null, roundNumber: 1 });
    // A bye is worth a win, so its holder leads before a single game has been played.
    expect((await fixture.swiss.standings(fixture.tournamentId))[0]!.points).toBe(3);
  });

  it("persists the pairing audit the round was published with", async () => {
    await start(false, 4);
    const audit = (
      await fixture.accounts.pool.query<{
        score_difference: number;
        score_difference_optimal: boolean;
        budget_exhausted: boolean;
      }>(
        `SELECT score_difference, score_difference_optimal, budget_exhausted FROM tournament_rounds r
         JOIN tournament_phases p ON p.id=r.phase_id WHERE p.tournament_id=$1 AND r.number=1`,
        [fixture.tournamentId],
      )
    ).rows[0]!;
    // Round 1 has no results yet, so every pairing is level.
    expect(audit.score_difference).toBe(0);
    expect(audit.score_difference_optimal).toBe(true);
    expect(audit.budget_exhausted).toBe(false);
  });
});

describe("SwissProgram round closing", () => {
  it("refuses to close, and publishes nothing, while a match is still open", async () => {
    await start(false, 4);
    const roundId = await roundIdOf(1);
    const matches = await playableMatches(1);
    await resolveMatch(matches[0]!, 0, T0);

    const closed = await fixture.swiss.closeRoundIfComplete(roundId, T0 + 1000);
    expect(closed.ok && closed.value.kind).toBe("not_complete");
    const phase = await currentPhase();
    expect(phase.rounds).toHaveLength(1);
    expect(phase.rounds[0]!.status).toBe("published");
    // Nothing is ledgered mid-round: an open round leaks no partial standings.
    expect(await fixture.swiss.ledger(fixture.tournamentId)).toHaveLength(0);
  });

  it("closes a complete round, ledgers both seats and publishes the next one atomically", async () => {
    await start(false, 4);
    const matches = await playableMatches(1);
    await playRound(1, T0);
    const closed = await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);
    expect(closed.ok && closed.value).toEqual({ kind: "next_round_published", roundNumber: 2 });

    const ledger = await fixture.swiss.ledger(fixture.tournamentId);
    expect(ledger).toHaveLength(4);
    for (const match of matches) {
      const winner = fixture.byAccount.get(match.accountIds[0])!;
      const loser = fixture.byAccount.get(match.accountIds[1])!;
      expect(ledger).toContainEqual({
        participantId: winner.participantId,
        opponentId: loser.participantId,
        opponentKind: "human",
        roundNumber: 1,
        outcome: "win",
      });
      expect(ledger).toContainEqual({
        participantId: loser.participantId,
        opponentId: winner.participantId,
        opponentKind: "human",
        roundNumber: 1,
        outcome: "loss",
      });
    }

    const phase = await currentPhase();
    expect(phase.rounds.map((round) => round.status)).toEqual(["closed", "published"]);
    expect(phase.rounds[1]!.matches).toHaveLength(2);
    for (const match of phase.rounds[1]!.matches) expect(match.joinDeadlineAt).toBe(T0 + 1000 + JOIN_GRACE_MS);
  });

  it("pairs round 2 by score and without a rematch", async () => {
    await start(false, 4);
    const round1 = await playableMatches(1);
    await playRound(1, T0);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);

    const previousOpponents = new Set(round1.map((match) => [...match.accountIds].sort().join("|")));
    const round2 = await playableMatches(2);
    expect(round2).toHaveLength(2);
    for (const match of round2) expect(previousOpponents.has([...match.accountIds].sort().join("|"))).toBe(false);

    // Winners meet winners: every round-2 pairing is between two participants on equal points.
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    const pointsOf = (accountId: string) =>
      standings.find((row) => row.participantId === fixture.byAccount.get(accountId)!.participantId)!.points;
    for (const match of round2) expect(pointsOf(match.accountIds[0])).toBe(pointsOf(match.accountIds[1]));
    expect(
      (
        await fixture.accounts.pool.query<{ pairing_reason: string }>(
          "SELECT pairing_reason FROM tournament_matches WHERE tournament_id=$1 AND round=2",
          [fixture.tournamentId],
        )
      ).rows.map((row) => row.pairing_reason),
    ).toEqual(["same_score", "same_score"]);
  });

  /**
   * The published round is exactly what the pure pairer produces from the persisted roster and
   * ledger — no clock, no insertion order, no leftover in-memory state. Two separate events cannot
   * be compared instead: their tournament and participant ids differ, and those ARE the pairing
   * input, so a differing round would be correct rather than a defect.
   */
  it("is deterministic: the published round is reproducible from persisted state alone", async () => {
    await start(false, 4);
    await playRound(1, T0);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);

    const roster = (
      await fixture.accounts.pool.query<{ id: string; seed: number | null }>(
        "SELECT id, seed FROM tournament_participants WHERE tournament_id=$1 AND status='active' ORDER BY created_at, id",
        [fixture.tournamentId],
      )
    ).rows;
    const ledger = await fixture.swiss.ledger(fixture.tournamentId);
    const points = new Map(
      computeStandings({
        ledger,
        standings: standingsConfig(buildTournamentRules({ bestOf: 3 })),
        participants: roster.map((row) => ({ id: row.id, seed: row.seed })),
      }).map((row) => [row.participantId, row.points]),
    );
    const repaired = pairSwissRound({
      participants: roster.map((row) => ({
        id: row.id,
        seed: row.seed,
        points: points.get(row.id) ?? 0,
        opponentIds: ledger
          .filter((entry) => entry.participantId === row.id)
          .flatMap((entry) => entry.opponentId ?? []),
        byeCount: ledger.filter((entry) => entry.participantId === row.id && entry.outcome === "bye").length,
      })),
      roundNumber: 2,
      seed: fixture.tournamentId,
    });
    expect(repaired.ok).toBe(true);

    const persisted = (await playableMatches(2)).map((match) =>
      match.accountIds.map((accountId) => fixture.byAccount.get(accountId)!.participantId),
    );
    const expected = (repaired.ok ? repaired.result.pairings : []).map((pairing) => [
      pairing.participant0Id,
      pairing.participant1Id,
    ]);
    expect(persisted).toEqual(expected);
  });

  it("is idempotent: closing a closed round changes nothing", async () => {
    await start(false, 4);
    await playRound(1, T0);
    const roundId = await roundIdOf(1);
    await fixture.swiss.closeRoundIfComplete(roundId, T0 + 1000);
    const again = await fixture.swiss.closeRoundIfComplete(roundId, T0 + 2000);
    expect(again.ok && again.value.kind).toBe("already_closed");
    expect((await currentPhase()).rounds).toHaveLength(2);
    expect(await fixture.swiss.ledger(fixture.tournamentId)).toHaveLength(4);
  });

  it("records a timed-out confrontation as a draw for both seats", async () => {
    await start(false, 4);
    await playRound(1, T0, [null, 0]);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 5_000_000);
    const ledger = await fixture.swiss.ledger(fixture.tournamentId);
    expect(ledger.filter((entry) => entry.outcome === "draw")).toHaveLength(2);
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    expect(standings.filter((row) => row.draws === 1 && row.points === 1)).toHaveLength(2);
  });

  it("blocks the round when a confrontation needs an organizer decision", async () => {
    await start(false, 4);
    await playRound(1, T0);
    const matches = await playableMatches(1);
    const seriesRecord = (await fixture.series.seriesForMatch(matches[0]!.matchId))!;
    await fixture.accounts.pool.query(
      "UPDATE match_series SET status='needs_organizer_decision', official_result=NULL WHERE id=$1",
      [seriesRecord.id],
    );
    const closed = await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);
    expect(closed.ok).toBe(false);
    expect(!closed.ok && closed.reason).toBe("match_needs_organizer_decision");
  });
});

describe("SwissProgram completion", () => {
  it("finishes the event on the last planned round and names the standings leader as winner", async () => {
    await start(false, 4);
    const transitions: string[] = [];
    for (const roundNumber of [1, 2, 3]) {
      await playRound(roundNumber, T0 + roundNumber * 10_000);
      const outcome = await fixture.swiss.closeRoundIfComplete(await roundIdOf(roundNumber), T0 + roundNumber * 20_000);
      transitions.push(outcome.ok ? outcome.value.kind : `failed:${outcome.reason}`);
    }
    expect(transitions).toEqual(["next_round_published", "next_round_published", "tournament_finished"]);
    const finished = await fixture.swiss.closeRoundIfComplete(await roundIdOf(3), T0 + 90_000);
    expect(finished.ok && finished.value.kind).toBe("already_closed");

    const phase = await currentPhase();
    expect(phase.status).toBe("finished");
    expect(phase.rounds.map((round) => round.status)).toEqual(["closed", "closed", "closed"]);

    const tournament = (await fixture.accounts.tournament(fixture.tournamentId))!;
    expect(tournament.status).toBe("finished");
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    expect(standings[0]!.rank).toBe(1);
    expect(tournament.winnerAccountId).toBe(fixture.byParticipant.get(standings[0]!.participantId)!.accountId);
    expect((await new TrophyStore(fixture.accounts).getTrophies(tournament.winnerAccountId!)).items).toMatchObject([
      { award: "tournament_champion", tier: "gold", source: { tournamentId: fixture.tournamentId } },
    ]);
    // Twelve entries: four participants across three rounds, one row each.
    expect(await fixture.swiss.ledger(fixture.tournamentId)).toHaveLength(12);
  });

  /**
   * A frozen Top Cut is a handover, not an ending. The Swiss phase parks in `frozen` and the
   * tournament stays running for the Top Cut slice to pick up; naming a Swiss leader as champion
   * here would crown somebody the cut is about to eliminate.
   */
  it("freezes the phase for a Top Cut instead of finishing the tournament", async () => {
    await start(true, 8);
    await fixture.accounts.pool.query("UPDATE tournaments SET top_cut_size=4 WHERE id=$1", [fixture.tournamentId]);
    for (const roundNumber of [1, 2, 3]) {
      await playRound(roundNumber, T0 + roundNumber * 10_000);
      await fixture.swiss.closeRoundIfComplete(await roundIdOf(roundNumber), T0 + roundNumber * 20_000);
    }
    const phase = await currentPhase();
    expect(phase.status).toBe("frozen");
    const tournament = (await fixture.accounts.tournament(fixture.tournamentId))!;
    expect(tournament.status).toBe("in_progress");
    expect(tournament.winnerAccountId).toBeNull();
  });

  /**
   * A player who walks out cannot win by having walked out early enough. Their standings row stays
   * — the results are real and their opponents' tiebreakers are computed from them — but the title
   * goes to the highest-ranked player who was still in the event when it ended.
   */
  it("never crowns a dropped participant, and keeps their standings row", async () => {
    await start(false, 4);
    await playRound(1, T0);
    const leaders = (await playableMatches(1)).map((match) => fixture.byAccount.get(match.accountIds[0])!);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);
    for (const leader of leaders)
      await fixture.participants.drop({
        tournamentId: fixture.tournamentId,
        accountId: leader.accountId,
        now: T0 + 1500,
      });

    for (const roundNumber of [2, 3]) {
      await playRound(roundNumber, T0 + roundNumber * 10_000);
      await fixture.swiss.closeRoundIfComplete(await roundIdOf(roundNumber), T0 + roundNumber * 20_000);
    }

    const tournament = (await fixture.accounts.tournament(fixture.tournamentId))!;
    expect(tournament.status).toBe("finished");
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    const droppedIds = new Set(leaders.map((leader) => leader.participantId));
    // The round-1 winners still lead on points, so the blind `standings[0]` would have crowned one.
    expect(droppedIds.has(standings[0]!.participantId)).toBe(true);
    // ...and every one of them still holds a row, so nobody's OMW% silently changed.
    expect(standings).toHaveLength(4);
    for (const leader of leaders) expect(rankOf(standings, leader.participantId)).toBeGreaterThan(0);

    const championId = fixture.byParticipant.get(
      standings.find((row) => !droppedIds.has(row.participantId))!.participantId,
    )!.accountId;
    expect(tournament.winnerAccountId).toBe(championId);
    expect(leaders.map((leader) => leader.accountId)).not.toContain(tournament.winnerAccountId);
  });

  it("runs an eight-player event to a single champion", async () => {
    await start(false, 8);
    expect((await currentPhase()).plannedRounds).toBe(3);
    expect(await playableMatches(1)).toHaveLength(4);
    for (const roundNumber of [1, 2, 3]) {
      await playRound(roundNumber, T0 + roundNumber * 10_000);
      await fixture.swiss.closeRoundIfComplete(await roundIdOf(roundNumber), T0 + roundNumber * 20_000);
    }
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    expect(standings).toHaveLength(8);
    expect(new Set(standings.map((row) => row.rank)).size).toBe(8);
    expect(standings[0]!.wins).toBe(3);
    expect((await fixture.accounts.tournament(fixture.tournamentId))!.status).toBe("finished");
  });

  /**
   * A drop takes effect at the next PAIRING, not retroactively: round 2 was already published when
   * the player left, so they stay in it — un-pairing a published round would leave their opponent
   * with no match and rewrite a round people are already seated for. Round 3, paired after the
   * drop, is the first one they are absent from.
   */
  it("excludes a participant who drops mid tournament from the next round paired, keeping their ledger", async () => {
    await start(false, 4);
    await playRound(1, T0);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);

    const dropped = fixture.byAccount.get((await playableMatches(2))[0]!.accountIds[0])!;
    await fixture.participants.drop({
      tournamentId: fixture.tournamentId,
      accountId: dropped.accountId,
      now: T0 + 2000,
    });
    await playRound(2, T0 + 3000);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(2), T0 + 4000);

    const ledgerBefore = (await fixture.swiss.ledger(fixture.tournamentId)).filter(
      (entry) => entry.participantId === dropped.participantId,
    );
    expect(ledgerBefore.map((entry) => entry.roundNumber)).toEqual([1, 2]);

    const round3 = await playableMatches(3);
    const seated = new Set(round3.flatMap((match) => match.accountIds));
    expect(seated.has(dropped.accountId)).toBe(false);
    // Three active participants left, so one of them takes the bye instead.
    expect(round3).toHaveLength(1);

    await playRound(3, T0 + 5000);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(3), T0 + 6000);
    // The results they earned stay untouched, so their past opponents keep the credit they played for.
    expect(
      (await fixture.swiss.ledger(fixture.tournamentId)).filter(
        (entry) => entry.participantId === dropped.participantId,
      ),
    ).toEqual(ledgerBefore);
    // ...and they still hold a standings row, because the ledger still names them.
    expect(rankOf(await fixture.swiss.standings(fixture.tournamentId), dropped.participantId)).toBeGreaterThan(0);
  });
});

describe("SwissProgram atomicity", () => {
  /**
   * The half-state that would strand a tournament for ever: the round closes and ledgers, then the
   * next round cannot be paired. Committing that leaves the round closed with no successor, and
   * every retry reports `already_closed` — nothing would ever publish round 2 again. The close must
   * therefore fail as one unit, so the retry sees the round still open.
   */
  it("rolls the whole close back when the next round cannot be published", async () => {
    const { pool, verbs } = recordingPool();
    await start(false, 4, pool);
    await playRound(1, T0);
    // Everybody leaves before the round closes, so there is no field left to pair round 2 from.
    for (const player of fixture.players)
      await fixture.participants.drop({
        tournamentId: fixture.tournamentId,
        accountId: player.accountId,
        now: T0 + 500,
      });

    const roundId = await roundIdOf(1);
    verbs.length = 0;
    const closed = await fixture.swiss.closeRoundIfComplete(roundId, T0 + 1000);
    expect(closed.ok).toBe(false);
    expect(!closed.ok && closed.reason).toBe("no_active_participants");
    // The close ledgered the round and marked it closed before pairing failed. Those writes are
    // exactly what must not survive, so the transaction has to end on ROLLBACK, not COMMIT.
    //
    // The retry that this buys — round still open, close succeeds once the field is restored —
    // cannot be asserted here: pg-mem applies the rolled-back statements anyway, so the round reads
    // as closed and the retry reports `already_closed`. That is the fake's limitation, not the
    // module's behaviour, and asserting around it would only pin the fake's bug.
    expect(verbs).toEqual(["BEGIN", "ROLLBACK"]);
    // Whatever it did or did not undo, the failure must not have counted anyone twice.
    const round1 = (await fixture.swiss.ledger(fixture.tournamentId)).filter((entry) => entry.roundNumber === 1);
    expect(new Set(round1.map((entry) => entry.participantId)).size).toBe(round1.length);
  });

  it("commits a successful start and rolls back one that refuses", async () => {
    const { pool, verbs } = recordingPool();
    fixture = await build(4, { pool });
    verbs.length = 0;
    expect((await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0)).ok).toBe(true);
    expect(verbs).toEqual(["BEGIN", "COMMIT"]);

    await fixture.accounts.pool.query("UPDATE tournaments SET structure='single_elimination' WHERE id=$1", [
      fixture.tournamentId,
    ]);
    verbs.length = 0;
    expect((await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0)).ok).toBe(false);
    expect(verbs).toEqual(["BEGIN", "ROLLBACK"]);
  });
});

describe("SwissProgram sweep", () => {
  it("closes a complete round whose notification was never delivered", async () => {
    await start(false, 4);
    // The whole round resolves with no listener wired: exactly what a crash between the series
    // commit and the announce leaves behind.
    await playRound(1, T0);
    expect((await currentPhase()).rounds[0]!.status).toBe("published");

    expect(await fixture.swiss.sweepOpenTournaments(T0 + 1000)).toBe(1);
    const phase = await currentPhase();
    expect(phase.rounds.map((round) => round.status)).toEqual(["closed", "published"]);
    expect(await fixture.swiss.ledger(fixture.tournamentId)).toHaveLength(4);
  });

  it("does nothing, and reports nothing moved, while a round is still being played", async () => {
    await start(false, 4);
    await resolveMatch((await playableMatches(1))[0]!, 0, T0);
    expect(await fixture.swiss.sweepOpenTournaments(T0 + 1000)).toBe(0);
    expect((await currentPhase()).rounds).toHaveLength(1);
    expect(await fixture.swiss.ledger(fixture.tournamentId)).toHaveLength(0);
  });

  it("republishes a round a rolled-back publication left missing", async () => {
    await start(false, 4);
    await playRound(1, T0);
    await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);
    // Reproduce the half-state directly: round 1 closed, round 2 gone.
    await fixture.accounts.pool.query("DELETE FROM tournament_matches WHERE tournament_id=$1 AND round=2", [
      fixture.tournamentId,
    ]);
    await fixture.accounts.pool.query("DELETE FROM tournament_rounds WHERE id=$1", [await roundIdOf(2)]);
    expect((await currentPhase()).rounds).toHaveLength(1);

    expect(await fixture.swiss.sweepOpenTournaments(T0 + 2000)).toBe(1);
    const phase = await currentPhase();
    expect(phase.rounds.map((round) => round.status)).toEqual(["closed", "published"]);
    expect(await playableMatches(2)).toHaveLength(2);
  });

  it("skips a round parked on an organizer decision without reporting it as moved", async () => {
    await start(false, 4);
    await playRound(1, T0);
    const seriesRecord = (await fixture.series.seriesForMatch((await playableMatches(1))[0]!.matchId))!;
    await fixture.accounts.pool.query(
      "UPDATE match_series SET status='needs_organizer_decision', official_result=NULL WHERE id=$1",
      [seriesRecord.id],
    );
    expect(await fixture.swiss.sweepOpenTournaments(T0 + 1000)).toBe(0);
    expect((await currentPhase()).rounds[0]!.status).toBe("published");
  });

  it("ignores a finished tournament", async () => {
    await start(false, 4);
    for (const roundNumber of [1, 2, 3]) {
      await playRound(roundNumber, T0 + roundNumber * 10_000);
      await fixture.swiss.closeRoundIfComplete(await roundIdOf(roundNumber), T0 + roundNumber * 20_000);
    }
    expect(await fixture.swiss.sweepOpenTournaments(T0 + 90_000)).toBe(0);
  });
});

describe("SwissProgram resolution seam", () => {
  it("closes the round from the series-resolution notification alone", async () => {
    // This listener is in-memory state: restoring database rows cannot remove it.
    // Give this scenario its own stores so it cannot close later tests' rounds.
    await start(false, 4, createMemoryPool());
    const notified: string[] = [];
    fixture.series.addResolutionListener(async ({ matchId }) => {
      notified.push(matchId);
      await fixture.swiss.onSeriesResolved(matchId, T0 + 1000);
    });
    await playRound(1, T0);
    expect(notified).toHaveLength(2);
    const phase = await currentPhase();
    expect(phase.rounds.map((round) => round.status)).toEqual(["closed", "published"]);
    expect(await fixture.swiss.ledger(fixture.tournamentId)).toHaveLength(4);
  });

  it("ignores a match that belongs to no round", async () => {
    fixture = await build(4);
    const orphan = randomUUID();
    await fixture.accounts.pool.query(
      `INSERT INTO tournament_matches (id, tournament_id, round, position, status) VALUES ($1,$2,9,0,'pending')`,
      [orphan, fixture.tournamentId],
    );
    const outcome = await fixture.swiss.onSeriesResolved(orphan, T0);
    expect(outcome.ok && outcome.value.kind).toBe("not_complete");
  });
});

describe("SwissProgram views", () => {
  beforeEach(async () => {
    await start(false, 5);
  });

  it("reports every phase with its rounds and per-match series scores", async () => {
    const phases = await fixture.swiss.phaseViews(fixture.tournamentId);
    expect(phases).toHaveLength(1);
    const round = phases[0]!.rounds[0]!;
    // Two played pairings plus the bye: every match of the round is in its round's view.
    expect(round.matches).toHaveLength(3);
    expect(round.matches.every((match) => match.wins0 === 0 && match.wins1 === 0)).toBe(true);
    expect(round.matches.filter((match) => match.joinDeadlineAt !== null)).toHaveLength(2);
  });

  it("publishes the pairer's reason on every match of the round", async () => {
    const round = (await fixture.swiss.phaseViews(fixture.tournamentId))[0]!.rounds[0]!;
    // Round 1 has no results to separate anybody, so every played pairing is same-score and the
    // odd player out takes the bye. The point is that the stored reason REACHES the wire shape at
    // all — without it, a paired-down player later in the event has no way to be told.
    const stored = (
      await fixture.accounts.pool.query<{ id: string; pairing_reason: string | null }>(
        "SELECT id, pairing_reason FROM tournament_matches WHERE tournament_id=$1",
        [fixture.tournamentId],
      )
    ).rows;
    expect(stored.every((row) => row.pairing_reason !== null)).toBe(true);
    const byId = new Map(stored.map((row) => [row.id, row.pairing_reason]));
    for (const match of round.matches) expect(match.pairingReason).toBe(byId.get(match.matchId));
    expect(round.matches.filter((match) => match.pairingReason === "same_score")).toHaveLength(2);
  });

  it("reports standings ranked from the ledger, with every participant present", async () => {
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    expect(standings).toHaveLength(5);
    expect(standings.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    // Only the bye has scored, so exactly one row carries points.
    expect(standings.filter((row) => row.points > 0)).toHaveLength(1);
  });
});

/**
 * The tiebreaker vocabulary is the projection's, and has been since the 1.1.0 presets. The
 * translation layer stays because a ruleset is FROZEN at creation: every event created under
 * `bandai_general/1.0.0` still carries the old spelling in its `rules_snapshot`, and no edit to the
 * presets module can reach it.
 */
describe("standingsConfig bridges frozen snapshots to the projection", () => {
  const CANONICAL = ["points", "match_win_rate", "opponent_match_win_rate", "head_to_head", "judge_random_draw"];

  it("passes a snapshot frozen under the current presets through unchanged", () => {
    const rules = buildTournamentRules({ bestOf: 3 });
    expect(rules.standings.tiebreakers).toEqual(CANONICAL);
    expect(standingsConfig(rules).tiebreakers).toEqual(CANONICAL);
  });

  it("translates a snapshot frozen under the 1.0.0 presets to the same criteria", () => {
    const existing = {
      ...buildTournamentRules({ bestOf: 3 }),
      version: "bandai_general/1.0.0",
      standings: {
        ...buildTournamentRules({ bestOf: 3 }).standings,
        tiebreakers: [
          "match_points",
          "own_match_win_rate",
          "opponent_match_win_rate",
          "head_to_head",
          "random_final_position",
        ],
      },
    };
    expect(standingsConfig(existing).tiebreakers).toEqual(CANONICAL);
  });

  it("drops a criterion no projection can resolve rather than taking the standings offline", () => {
    const rules = buildTournamentRules({ bestOf: 3 });
    const broken = { ...rules, standings: { ...rules.standings, tiebreakers: ["points", "no_such_criterion"] } };
    expect(standingsConfig(broken, "tournament-with-a-bad-tiebreaker").tiebreakers).toEqual(["points"]);
  });
});

describe("manual round release", () => {
  it("keeps completed rounds paused through worker sweeps until the organizer releases the next round", async () => {
    await start(false, 4);
    await fixture.accounts.pool.query("UPDATE tournaments SET round_start_mode='manual' WHERE id=$1", [
      fixture.tournamentId,
    ]);
    await playRound(1, T0);
    const closed = await fixture.swiss.closeRoundIfComplete(await roundIdOf(1), T0 + 1000);
    expect(closed).toEqual({ ok: true, value: { kind: "awaiting_manual_start" } });
    await fixture.swiss.sweepOpenTournaments(T0 + 60_000);
    expect((await currentPhase()).rounds).toHaveLength(1);
    expect(await fixture.swiss.startNextRound(fixture.tournamentId, T0 + 120_000)).toEqual({ ok: true, value: 2 });
    const phase = await currentPhase();
    expect(phase.rounds).toHaveLength(2);
    expect((await playableMatches(2)).length).toBeGreaterThan(0);
    expect(await fixture.swiss.startNextRound(fixture.tournamentId, T0 + 120_000)).toMatchObject({
      ok: false,
      reason: "round_not_ready",
    });
  });

  it("waits for manual release before publishing the first Swiss round", async () => {
    fixture = await build(4);
    await fixture.accounts.pool.query("UPDATE tournaments SET round_start_mode='manual' WHERE id=$1", [
      fixture.tournamentId,
    ]);
    expect((await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0)).ok).toBe(true);
    await fixture.swiss.sweepOpenTournaments(T0 + 60_000);
    expect((await currentPhase()).rounds).toHaveLength(0);
    expect(await fixture.swiss.startNextRound(fixture.tournamentId, T0 + 120_000)).toEqual({ ok: true, value: 1 });
  });
});

it("refuses legacy room tickets that would bypass the program's frozen deck and series", async () => {
  await start(false, 4);
  const match = (await fixture.accounts.tournamentMatches(fixture.tournamentId)).find(
    (entry) => entry.status === "pending",
  )!;
  expect(
    await fixture.accounts.createTournamentMatchTicket(match.player0AccountId!, fixture.tournamentId, match.id),
  ).toBeUndefined();
  expect(await fixture.accounts.claimTournamentRoom(match.id, "legacy-bypass")).toBe(false);
});
