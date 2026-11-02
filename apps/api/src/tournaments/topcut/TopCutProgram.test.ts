import { TrophyStore } from "#api/achievements/TrophyStore";
import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import type { PhaseView } from "@aegis/shared";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { readTournamentEvents } from "../audit/index.js";
import { RED_DECK } from "../../engine/testDecks.js";
import { EliminationStore } from "../elimination/index.js";
import { ParticipantStore } from "../participants/index.js";
import { seriesDurationFor } from "../rules/index.js";
import { matchClockContext, SeriesStore } from "../series/index.js";
import { SwissProgram } from "../swiss/index.js";
import { TopCutProgram } from "./TopCutProgram.js";

const T0 = 1_000_000;
const RULES = buildTournamentRules({ bestOf: 3 });
const SWISS_MS = RULES.match.swissDurationMs!;
const TOP_CUT_MS = RULES.match.topCutDurationMs!;
const OVERTIME_MS = RULES.match.overtimeMs;

type Fixture = {
  accounts: AccountStore;
  participants: ParticipantStore;
  series: SeriesStore;
  swiss: SwissProgram;
  elimination: EliminationStore;
  topCut: TopCutProgram;
  tournamentId: string;
  participantIds: string[];
};

let fixture: Fixture;

/** One cache for this file: an arrangement is built once and restored for every test that reuses it. */
const fixtureFor = snapshotFixtures<Fixture>();

function stores(pool: Pool): Omit<Fixture, "tournamentId" | "participantIds"> {
  const accounts = new AccountStore(pool);
  const series = new SeriesStore(accounts);
  const elimination = new EliminationStore(accounts);
  return {
    accounts,
    participants: new ParticipantStore(accounts),
    series,
    swiss: new SwissProgram(accounts, series),
    elimination,
    topCut: new TopCutProgram(accounts, elimination),
  };
}

/**
 * A Swiss event carried through the real registration flow, exactly as `SwissProgram.test.ts`
 * builds one: every player saves a legal deck, registers, checks in, and `closeCheckIn` freezes
 * the field. This is the fixture the end-to-end cases use — the ones that must prove the cut works
 * on standings the tournament actually played for.
 */
async function playedField(playerCount: number, topCut: boolean): Promise<Fixture> {
  return fixtureFor(`played:${playerCount}:${topCut}`, (pool) => buildPlayedField(pool, playerCount, topCut));
}

async function buildPlayedField(pool: Pool, playerCount: number, topCut: boolean): Promise<Fixture> {
  const base = stores(pool);
  const organizer = await base.accounts.accountForIdentity("discord", "organizer", "Organizer");
  const tournament = await base.accounts.createTournament(organizer.id, {
    name: "Swiss Cup",
    block: "BT10",
    startsAt: T0,
    maxPlayers: Math.max(playerCount, 16),
    structure: "swiss",
    bestOf: 3,
    topCutEnabled: topCut,
    rules: RULES,
  });

  for (let index = 0; index < playerCount; index += 1) {
    const name = `Player${index + 1}`;
    const account = await base.accounts.accountForIdentity("discord", name.toLowerCase(), name);
    const deck = await base.accounts.saveDeck(account.id, {
      name: "Competitive",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    const registered = await base.participants.register({
      tournamentId: tournament.id,
      accountId: account.id,
      savedDeckId: deck.id,
      now: T0,
    });
    if (!registered.ok) throw new Error(`registration failed: ${registered.reason}`);
    const checkedIn = await base.participants.checkIn({ tournamentId: tournament.id, accountId: account.id, now: T0 });
    if (!checkedIn.ok) throw new Error(`check-in failed: ${checkedIn.reason}`);
  }
  const frozen = await base.participants.closeCheckIn({ tournamentId: tournament.id, now: T0 });
  if (!frozen.ok) throw new Error(`close check-in failed: ${frozen.reason}`);
  return { ...base, tournamentId: tournament.id, participantIds: frozen.value.map((row) => row.id) };
}

/**
 * A Swiss phase already sitting frozen, with a ledger written directly.
 *
 * The transition's own behaviour — eligibility, the cut line, mirrored seeding, idempotency — is a
 * function of the standings and the roster, and nothing else. Playing sixteen rounds of
 * best-of-three through the series module to arrive at a chosen standings order would test the
 * Swiss program (which has its own suite) at ten times the cost. So the cases that are ABOUT the
 * cut arrange the ledger they need; the end-to-end case below plays for its.
 *
 * `wins[i]` is how many rounds participant `i` won, out of `rounds`; the rest are losses. Opponents
 * are left null, which the projection reports as unrated rather than scoring — the order under test
 * is the points order.
 */
async function frozenField(input: {
  playerCount: number;
  topCutSize: number;
  wins: readonly number[];
  rounds?: number;
}): Promise<Fixture> {
  return fixtureFor(`frozen:${JSON.stringify(input)}`, (pool) => buildFrozenField(pool, input));
}

async function buildFrozenField(
  pool: Pool,
  input: { playerCount: number; topCutSize: number; wins: readonly number[]; rounds?: number },
): Promise<Fixture> {
  const base = stores(pool);
  const organizer = await base.accounts.accountForIdentity("discord", "organizer", "Organizer");
  const tournament = await base.accounts.createTournament(organizer.id, {
    name: "Swiss Cup",
    block: "BT10",
    startsAt: T0,
    maxPlayers: input.playerCount,
    structure: "swiss",
    bestOf: 3,
    topCutEnabled: true,
    rules: RULES,
  });
  await base.accounts.ensureReady();
  await pool.query("UPDATE tournaments SET top_cut_size=$1, status='in_progress' WHERE id=$2", [
    input.topCutSize,
    tournament.id,
  ]);

  const participantIds: string[] = [];
  const participantValues: unknown[] = [];
  const participantRows: string[] = [];
  for (let index = 0; index < input.playerCount; index += 1) {
    const name = `Player${index + 1}`;
    const account = await base.accounts.accountForIdentity("discord", name.toLowerCase(), name);
    const id = randomUUID();
    participantIds.push(id);
    const offset = participantValues.length;
    participantValues.push(id, tournament.id, account.id, name, index + 1, T0 + index);
    participantRows.push(
      `($${offset + 1},$${offset + 2},'human',$${offset + 3},$${offset + 4},$${offset + 5},'active',$${offset + 6})`,
    );
  }
  await pool.query(
    `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, seed, status, created_at)
     VALUES ${participantRows.join(",")}`,
    participantValues,
  );

  const phaseId = randomUUID();
  const rounds = input.rounds ?? Math.max(...input.wins, 1);
  await pool.query(
    `INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, planned_rounds, created_at)
     VALUES ($1,$2,'swiss',0,'frozen',$3,$4)`,
    [phaseId, tournament.id, rounds, T0],
  );
  const ledgerValues: unknown[] = [];
  const ledgerRows: string[] = [];
  for (const [index, id] of participantIds.entries())
    for (let round = 1; round <= rounds; round += 1) {
      const offset = ledgerValues.length;
      ledgerValues.push(randomUUID(), tournament.id, id, round, round <= (input.wins[index] ?? 0) ? "win" : "loss", T0);
      ledgerRows.push(
        `($${offset + 1},$${offset + 2},$${offset + 3},NULL,NULL,$${offset + 4},$${offset + 5},$${offset + 6})`,
      );
    }
  await pool.query(
    `INSERT INTO tournament_result_ledger
       (id, tournament_id, participant_id, opponent_id, opponent_kind, round_number, outcome, recorded_at)
     VALUES ${ledgerRows.join(",")}`,
    ledgerValues,
  );

  return { ...base, tournamentId: tournament.id, participantIds };
}

async function phaseOf(kind: string): Promise<PhaseView | undefined> {
  return (await fixture.swiss.phaseViews(fixture.tournamentId)).find((phase) => phase.kind === kind);
}

type PlayableMatch = { matchId: string; accountIds: [string, string] };

async function playableMatches(phaseKind: string): Promise<PlayableMatch[]> {
  return (
    await fixture.accounts.pool.query<{ id: string; player0_account_id: string; player1_account_id: string }>(
      `SELECT m.id, m.player0_account_id, m.player1_account_id
       FROM tournament_matches m JOIN tournament_phases p ON p.id = m.phase_id
       WHERE m.tournament_id=$1 AND p.kind=$2 AND m.status='pending' ORDER BY m.round, m.position`,
      [fixture.tournamentId, phaseKind],
    )
  ).rows.map((row) => ({
    matchId: row.id,
    accountIds: [row.player0_account_id, row.player1_account_id] as [string, string],
  }));
}

/** One confrontation driven through the real series module: both arrive, seat `winnerSeat` wins 2-0. */
async function resolveMatch(match: PlayableMatch, winnerSeat: 0 | 1, now: number): Promise<void> {
  const duration = await seriesDurationOfMatch(match.matchId);
  for (const accountId of match.accountIds)
    await fixture.series.markPresent({
      tournamentId: fixture.tournamentId,
      matchId: match.matchId,
      accountId,
      winsRequired: 2,
      seriesDurationMs: duration,
      now,
    });
  const series = (await fixture.series.seriesForMatch(match.matchId))!;
  for (let game = 0; game < 2; game += 1) {
    const roomId = `room-${match.matchId}-${game}`;
    const authorized = await fixture.series.authorizeNextGame({
      seriesId: series.id,
      accountId: match.accountIds[0],
      now,
    });
    if (!authorized.ok) throw new Error(`authorization failed: ${authorized.reason}`);
    await fixture.accounts.pool.query("UPDATE tournament_games SET room_id=$1, status='playing' WHERE id=$2", [
      roomId,
      authorized.value.gameId,
    ]);
    await fixture.series.recordGameResult({
      gameId: authorized.value.gameId,
      roomId,
      outcome: { kind: "winner", winnerAccountId: match.accountIds[winnerSeat] },
      finishedAt: now + game + 1,
    });
  }
}

/** The clock the production presence endpoint would pick for this match. */
async function seriesDurationOfMatch(matchId: string): Promise<number | null> {
  const context = (await matchClockContext(fixture.accounts.pool, matchId))!;
  return seriesDurationFor(RULES, context);
}

/**
 * Plays the whole Swiss phase out, closing each round as its last confrontation resolves — the
 * production path, minus the in-process resolution listener the runtime wires.
 */
async function playSwiss(now: number): Promise<void> {
  for (;;) {
    const matches = await playableMatches("swiss");
    if (matches.length === 0) return;
    for (const match of matches) {
      await resolveMatch(match, 0, now);
      await fixture.swiss.onSeriesResolved(match.matchId, now);
    }
  }
}

describe("no cut is drawn when none was configured", () => {
  it("finishes a Swiss event by standings when the flag is off", async () => {
    fixture = await playedField(4, false);
    await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    await playSwiss(T0);

    expect(await phaseOf("top_cut")).toBeUndefined();
    expect((await phaseOf("swiss"))!.status).toBe("finished");
    expect(await statusOf()).toBe("finished");
    // Nothing for the transition to do, and it says so rather than writing anything.
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    expect(cut).toEqual({ ok: false, reason: "swiss_phase_not_frozen", detail: "finished" });
    expect(await fixture.topCut.snapshot(fixture.tournamentId)).toEqual([]);
  });

  it("finishes by standings when the flag is on but the field is too small to cut", async () => {
    // Official table (manual §3.6): a field of 8 or fewer produces `topCutSize` 0, so the flag
    // creates no phase at all.
    fixture = await playedField(8, true);
    await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    expect(await topCutSizeOf()).toBe(0);
    await playSwiss(T0);

    expect(await phaseOf("top_cut")).toBeUndefined();
    expect((await phaseOf("swiss"))!.status).toBe("finished");
    expect(await statusOf()).toBe("finished");
  });
});

describe("cutting a played-out Swiss event", () => {
  it("freezes the standings, seeds the top two and crowns the bracket's champion", async () => {
    // Nine players is the smallest field the official table cuts at all (9–16 → Top 2), and it
    // plays four rounds.
    fixture = await playedField(9, true);
    const swiss = await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    expect(swiss.ok && swiss.value.plannedRounds).toBe(4);
    expect(await topCutSizeOf()).toBe(2);

    await playSwiss(T0);
    const frozenSwiss = await phaseOf("swiss");
    expect(frozenSwiss!.status).toBe("frozen");
    expect(await statusOf()).toBe("in_progress");

    const standings = await fixture.swiss.standings(fixture.tournamentId);
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error(`cut failed: ${JSON.stringify(cut)}`);

    // The snapshot is EVERY participant's final position, not only the qualifiers: the whole order
    // is the record, and the two who made it carry the seed they made it with.
    const snapshot = await fixture.topCut.snapshot(fixture.tournamentId);
    expect(snapshot).toHaveLength(9);
    expect(snapshot.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(snapshot.map((row) => row.participantId)).toEqual(standings.map((row) => row.participantId));
    expect(snapshot.filter((row) => row.cutSeed !== null).map((row) => row.cutSeed)).toEqual([1, 2]);
    expect(snapshot.every((row) => row.eligible)).toBe(true);

    expect(cut.value.seeds).toEqual([
      { participantId: standings[0]!.participantId, rank: 1, seed: 1 },
      { participantId: standings[1]!.participantId, rank: 2, seed: 2 },
    ]);
    expect((await phaseOf("swiss"))!.status).toBe("finished");
    const cutPhase = await phaseOf("top_cut");
    expect(cutPhase!.status).toBe("running");
    expect(cutPhase!.plannedRounds).toBe(1);
    // The bracket reaches the detail payload as rounds of confrontations, the shape the client
    // already renders Swiss rounds with.
    expect(cutPhase!.rounds).toHaveLength(1);
    expect(cutPhase!.rounds[0]!.matches).toHaveLength(1);

    const final = (await playableMatches("top_cut"))[0]!;
    // Top 2 means one match, and that match IS the final: the official preset runs it untimed.
    expect(await seriesDurationOfMatch(final.matchId)).toBeNull();
    await resolveMatch(final, 0, T0);
    await fixture.elimination.onSeriesResolvedById((await fixture.series.seriesForMatch(final.matchId))!.id);
    const championAccountId = (await fixture.accounts.tournament(fixture.tournamentId))!.winnerAccountId!;
    expect((await new TrophyStore(fixture.accounts).getTrophies(championAccountId)).items).toMatchObject([
      { award: "tournament_champion", tier: "gold", source: { tournamentId: fixture.tournamentId } },
    ]);

    expect(await statusOf()).toBe("finished");
    expect((await phaseOf("top_cut"))!.status).toBe("finished");
    const champion = (await fixture.elimination.bracket(fixture.tournamentId))!.championParticipantId;
    expect(champion).toBe(standings[0]!.participantId);
    expect(await winnerAccountOf()).toBe(await accountOf(champion!));
    // Exactly once: the champion's tournaments_won is not double-counted by a retried advancement.
    await fixture.elimination.onSeriesResolvedById((await fixture.series.seriesForMatch(final.matchId))!.id);
    expect(await tournamentsWonOf(await accountOf(champion!))).toBe(1);
  });
});

/**
 * Everything above this point cuts an event whose Swiss phase wrote no MATCH rows, so its cut
 * phase starts at round offset 0 — which is the one case where the offset cannot be wrong. These
 * play a real Swiss first, so the cut is numbered after it, and assert the numbering end to end.
 */
describe("a cut that follows real Swiss rounds", () => {
  it("numbers its rounds, matches and ledger after the Swiss phase and advances through all of them", async () => {
    // Nine players play four real Swiss rounds; the frozen cut size is then set to 8, which is what
    // a 33+ player event would have frozen. Playing a 33-player, six-round Swiss to reach the same
    // arrangement would test SwissProgram, at roughly ten times the cost.
    fixture = await playedField(9, true);
    await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    await fixture.accounts.pool.query("UPDATE tournaments SET top_cut_size=8 WHERE id=$1", [fixture.tournamentId]);
    await playSwiss(T0);
    expect((await phaseOf("swiss"))!.status).toBe("frozen");

    const standings = await fixture.swiss.standings(fixture.tournamentId);
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error(`cut failed: ${JSON.stringify(cut)}`);
    expect(cut.value.seeds).toHaveLength(8);

    // Four Swiss rounds means the cut occupies rounds 5, 6 and 7 in the stored numbering — which is
    // what keeps its matches off the Swiss phase's (tournament, round, position) key and its results
    // out of the ledger's round-uniqueness key.
    expect(await phaseRoundOffset("top_cut")).toBe(4);
    expect([...(await matchesByRound("top_cut")).keys()].sort((a, b) => a - b)).toEqual([5, 6, 7]);
    // The phase still reports its OWN rounds, 1..3, to anybody reading the projection.
    expect((await phaseOf("top_cut"))!.rounds.map((round) => round.number)).toEqual([1, 2, 3]);
    expect((await phaseOf("top_cut"))!.plannedRounds).toBe(3);
    expect(await firstRoundSeedPairs()).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);

    // Every Swiss result sits at rounds 1..4 before a single cut match is played.
    expect(await ledgerRounds()).toEqual([1, 2, 3, 4]);

    // Play the whole bracket, higher seed always winning, one round at a time.
    for (const round of [5, 6, 7]) {
      const matches = await playableMatchesInRound(round);
      expect(matches.length).toBe(round === 5 ? 4 : round === 6 ? 2 : 1);
      for (const match of matches) {
        await resolveMatch(match, 0, T0);
        await fixture.elimination.onSeriesResolvedById((await fixture.series.seriesForMatch(match.matchId))!.id);
      }
    }
    // Cut results land at rounds 5, 6 and 7, so none of them collided with a Swiss round and got
    // swallowed by the ledger's ON CONFLICT DO NOTHING.
    expect(await ledgerRounds()).toEqual([1, 2, 3, 4, 5, 6, 7]);

    // The seed-1 player won every cut round and is the champion.
    const champion = (await fixture.elimination.bracket(fixture.tournamentId))!.championParticipantId;
    expect(champion).toBe(cut.value.seeds[0]!.participantId);
    expect(champion).toBe(standings[0]!.participantId);
    expect(await statusOf()).toBe("finished");
  });

  it("keeps the published Swiss standings still while the cut is being played", async () => {
    fixture = await playedField(9, true);
    await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    await playSwiss(T0);
    const beforeCut = await fixture.swiss.standings(fixture.tournamentId);

    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error("cut failed");
    const frozen = (await fixture.topCut.frozenStandings(fixture.tournamentId))!;
    expect(frozen).toEqual(beforeCut);

    // Play the cut's only match. Its ledger rows land at round 5.
    const final = (await playableMatches("top_cut"))[0]!;
    await resolveMatch(final, 0, T0);
    await fixture.elimination.onSeriesResolvedById((await fixture.series.seriesForMatch(final.matchId))!.id);
    expect(await ledgerRounds()).toEqual([1, 2, 3, 4, 5]);

    // Both halves of the fix: the live projection is scoped to the Swiss rounds, and the published
    // standings are the frozen snapshot either way.
    expect(await fixture.swiss.standings(fixture.tournamentId)).toEqual(beforeCut);
    expect(await fixture.topCut.frozenStandings(fixture.tournamentId)).toEqual(beforeCut);
  });

  it("gives a timed cut confrontation the cut clock plus its overtime", async () => {
    fixture = await playedField(9, true);
    await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    await fixture.accounts.pool.query("UPDATE tournaments SET top_cut_size=8 WHERE id=$1", [fixture.tournamentId]);
    await playSwiss(T0);
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok) throw new Error("cut failed");

    // A quarterfinal: 55 minutes of round, then the manual's five extra minutes, and only then is
    // the confrontation decided.
    const quarterfinal = (await playableMatchesInRound(5))[0]!;
    expect(await seriesDurationOfMatch(quarterfinal.matchId)).toBe(TOP_CUT_MS + OVERTIME_MS);
    for (const accountId of quarterfinal.accountIds)
      await fixture.series.markPresent({
        tournamentId: fixture.tournamentId,
        matchId: quarterfinal.matchId,
        accountId,
        winsRequired: 2,
        seriesDurationMs: await seriesDurationOfMatch(quarterfinal.matchId),
        now: T0,
      });
    // The deadline the series actually queued, not just the number the chooser returned.
    expect((await fixture.series.seriesForMatch(quarterfinal.matchId))!.seriesDeadlineAt).toBe(
      T0 + TOP_CUT_MS + OVERTIME_MS,
    );
  });
});

describe("seeding the cut", () => {
  it("mirrors a Top 4: 1 v 4 and 2 v 3", async () => {
    fixture = await frozenField({ playerCount: 20, topCutSize: 4, wins: seededWins(20) });
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error("cut failed");
    expect(cut.value.seeds.map((seed) => seed.seed)).toEqual([1, 2, 3, 4]);
    expect(await firstRoundSeedPairs()).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });

  it("mirrors a Top 8 into standard slot order, so seeds 1 and 2 are in opposite halves", async () => {
    fixture = await frozenField({ playerCount: 40, topCutSize: 8, wins: seededWins(40) });
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error("cut failed");
    // Slot order 1,8,4,5,2,7,3,6 — every pair sums to 9, and the halves are mirror images, so the
    // top two seeds can only meet in the final. Listing them 1v8, 2v7, 3v6, 4v5 in POSITION order
    // would put the winners of 1v8 and 2v7 in the same semifinal.
    expect(await firstRoundSeedPairs()).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    expect((await phaseOf("top_cut"))!.plannedRounds).toBe(3);
  });

  it("cuts at the standings' own total order when the boundary is a dead heat", async () => {
    // Ten players, ranks 7 and 8 identical in every ledger-resolvable respect: same points, same
    // win rate, same (absent) opponents. The standings still order them — registration seed, then
    // participant id — and that order IS the cut line. No play-in, no judge, no coin.
    fixture = await frozenField({
      playerCount: 10,
      topCutSize: 2,
      wins: [4, 3, 3, 2, 2, 2, 1, 1, 0, 0],
      rounds: 4,
    });
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    expect(standings[6]!.points).toBe(standings[7]!.points);
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error("cut failed");

    const snapshot = await fixture.topCut.snapshot(fixture.tournamentId);
    // Ranks 7 and 8 are distinct positions with identical records, and the snapshot records which
    // player held which — the evidence a dispute over the boundary would be settled from.
    expect(snapshot[6]!.participantId).toBe(standings[6]!.participantId);
    expect(snapshot[7]!.participantId).toBe(standings[7]!.participantId);
    expect(snapshot[6]!.rank).toBe(7);
    expect(snapshot[7]!.rank).toBe(8);
  });

  it("skips a player who dropped after the freeze and moves the next eligible one up", async () => {
    fixture = await frozenField({ playerCount: 12, topCutSize: 4, wins: seededWins(12) });
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    const dropped = standings[1]!.participantId;
    await fixture.accounts.pool.query("UPDATE tournament_participants SET status='dropped' WHERE id=$1", [dropped]);

    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error("cut failed");
    // The cut is still four players — a drop never resizes it — and rank 5 takes the vacated slot.
    expect(cut.value.seeds.map((seed) => seed.participantId)).toEqual([
      standings[0]!.participantId,
      standings[2]!.participantId,
      standings[3]!.participantId,
      standings[4]!.participantId,
    ]);
    expect(cut.value.seeds.map((seed) => seed.rank)).toEqual([1, 3, 4, 5]);

    const snapshot = await fixture.topCut.snapshot(fixture.tournamentId);
    // The snapshot says WHY: the second-placed player was not eligible, so their slot moved down.
    expect(snapshot.find((row) => row.participantId === dropped)).toMatchObject({
      rank: 2,
      eligible: false,
      cutSeed: null,
    });
  });

  it("refuses to seed a bot into the cut, and leaves the phase frozen for an organizer", async () => {
    // No official preset seats bots, so this is a corrupted field rather than a supported case.
    // The guard is structural: a bot in a bracket is present by definition and would advance on the
    // attendance ladder alone, taking a title nobody arbitrated.
    fixture = await frozenField({ playerCount: 12, topCutSize: 4, wins: seededWins(12) });
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    const promoted = standings[2]!.participantId;
    await fixture.accounts.pool.query("UPDATE tournament_participants SET kind='bot', account_id=NULL WHERE id=$1", [
      promoted,
    ]);

    expect(await fixture.topCut.startTopCut(fixture.tournamentId, T0)).toEqual({
      ok: false,
      reason: "bot_participant_in_cut",
      detail: promoted,
    });
    // Nothing was written: no bracket, no snapshot, and the Swiss phase still waits.
    expect(await phaseOf("top_cut")).toBeUndefined();
    expect(await fixture.topCut.snapshot(fixture.tournamentId)).toEqual([]);
    expect((await phaseOf("swiss"))?.status).toBe("frozen");
  });

  it("finishes the event by standings when fewer than two players are left to cut", async () => {
    fixture = await frozenField({ playerCount: 12, topCutSize: 4, wins: seededWins(12) });
    const standings = await fixture.swiss.standings(fixture.tournamentId);
    for (const row of standings.slice(1))
      await fixture.accounts.pool.query("UPDATE tournament_participants SET status='dropped' WHERE id=$1", [
        row.participantId,
      ]);

    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    expect(cut).toEqual({
      ok: true,
      value: { kind: "finished_without_cut", winnerParticipantId: standings[0]!.participantId },
    });
    expect(await phaseOf("top_cut")).toBeUndefined();
    expect(await statusOf()).toBe("finished");
    // The evidence is frozen even when no bracket follows: the final order is the result.
    expect(await fixture.topCut.snapshot(fixture.tournamentId)).toHaveLength(12);
    const winnerAccountId = await winnerAccountOf();
    expect((await new TrophyStore(fixture.accounts).getTrophies(winnerAccountId!)).items).toMatchObject([
      { award: "tournament_champion", tier: "gold", awardedAt: T0, source: { tournamentId: fixture.tournamentId } },
    ]);
  });
});

describe("the transition is safe to run twice", () => {
  it("appends one top_cut_started event carrying the size, the snapshot phase and the seeds", async () => {
    fixture = await frozenField({ playerCount: 12, topCutSize: 4, wins: seededWins(12) });
    const swissPhaseId = (await phaseOf("swiss"))!.id;
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok || cut.value.kind !== "started") throw new Error("cut failed");

    const trail = await readTournamentEvents(fixture.accounts.pool, fixture.tournamentId);
    const started = trail.filter((event) => event.command === "top_cut_started");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ actorKind: "system", phaseId: cut.value.phaseId, subjectKind: "phase" });
    expect(started[0]!.after).toEqual({
      topCutSize: 4,
      snapshotPhaseId: swissPhaseId,
      seededParticipantIds: cut.value.seeds.map((seed) => seed.participantId),
    });

    // A second transition finds the cut already drawn and appends nothing.
    await fixture.topCut.startTopCut(fixture.tournamentId, T0 + 1000);
    const again = await readTournamentEvents(fixture.accounts.pool, fixture.tournamentId);
    expect(again.filter((event) => event.command === "top_cut_started")).toHaveLength(1);
  });

  it("returns the existing bracket instead of redrawing it", async () => {
    fixture = await frozenField({ playerCount: 20, topCutSize: 4, wins: seededWins(20) });
    const first = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!first.ok || first.value.kind !== "started") throw new Error("cut failed");

    const second = await fixture.topCut.startTopCut(fixture.tournamentId, T0 + 1);
    expect(second.ok && second.value.kind).toBe("already_started");
    expect(second.ok && second.value.kind === "already_started" && second.value.phaseId).toBe(first.value.phaseId);
    expect(await phaseCount("top_cut")).toBe(1);
    expect(await fixture.topCut.snapshot(fixture.tournamentId)).toHaveLength(20);
  });

  it("is reached by the sweep as well as by the round-close path, and only cuts once", async () => {
    fixture = await frozenField({ playerCount: 20, topCutSize: 4, wins: seededWins(20) });
    expect(await fixture.topCut.sweepFrozenSwissPhases(T0)).toBe(1);
    // The phase is no longer frozen, so the next tick finds nothing to do and writes nothing.
    expect(await fixture.topCut.sweepFrozenSwissPhases(T0 + 1)).toBe(0);
    expect(await phaseCount("top_cut")).toBe(1);

    const again = await fixture.topCut.startTopCut(fixture.tournamentId, T0 + 2);
    expect(again.ok && again.value.kind).toBe("already_started");
    expect(await phaseCount("top_cut")).toBe(1);
  });

  it("leaves a Swiss phase that is still running alone", async () => {
    fixture = await playedField(9, true);
    await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    expect(cut).toEqual({ ok: false, reason: "swiss_phase_not_frozen", detail: "running" });
    expect(await fixture.topCut.sweepFrozenSwissPhases(T0)).toBe(0);
    expect(await phaseCount("top_cut")).toBe(0);
  });
});

describe("phase-aware clocks", () => {
  beforeEach(async () => {
    fixture = await frozenField({ playerCount: 40, topCutSize: 8, wins: seededWins(40) });
    const cut = await fixture.topCut.startTopCut(fixture.tournamentId, T0);
    if (!cut.ok) throw new Error("cut failed");
  });

  it("runs cut rounds on the cut clock and the final untimed", async () => {
    const rounds = await matchesByRound("top_cut");
    expect(await seriesDurationOfMatch(rounds.get(1)![0]!)).toBe(TOP_CUT_MS + OVERTIME_MS);
    expect(await seriesDurationOfMatch(rounds.get(2)![0]!)).toBe(TOP_CUT_MS + OVERTIME_MS);
    // Round 3 of a Top 8 is the final, and the official preset leaves it with no limit at all.
    expect(await seriesDurationOfMatch(rounds.get(3)![0]!)).toBeNull();
  });

  it("keeps Swiss rounds on the Swiss clock", async () => {
    const swissEvent = await playedField(9, true);
    fixture = swissEvent;
    await fixture.swiss.startTournamentProgram(fixture.tournamentId, T0);
    const match = (await playableMatches("swiss"))[0]!;
    expect(await seriesDurationOfMatch(match.matchId)).toBe(SWISS_MS + OVERTIME_MS);
  });
});

function seededWins(playerCount: number): number[] {
  return Array.from({ length: playerCount }, (_, index) => playerCount - index);
}

async function firstRoundSeedPairs(): Promise<[number, number][]> {
  return (
    await fixture.accounts.pool.query<{ seed0: number; seed1: number }>(
      `SELECT p0.top_cut_seed seed0, p1.top_cut_seed seed1
       FROM tournament_matches m
       JOIN tournament_phases ph ON ph.id = m.phase_id AND ph.kind='top_cut'
       JOIN tournament_participants p0 ON p0.id = m.player0_participant_id
       JOIN tournament_participants p1 ON p1.id = m.player1_participant_id
       WHERE m.tournament_id=$1 AND m.round = ph.round_offset + 1 ORDER BY m.position`,
      [fixture.tournamentId],
    )
  ).rows.map((row) => [Number(row.seed0), Number(row.seed1)]);
}

async function matchesByRound(kind: string): Promise<Map<number, string[]>> {
  const rows = (
    await fixture.accounts.pool.query<{ id: string; round: number }>(
      `SELECT m.id, m.round FROM tournament_matches m
       JOIN tournament_phases p ON p.id = m.phase_id AND p.kind=$2
       WHERE m.tournament_id=$1 ORDER BY m.round, m.position`,
      [fixture.tournamentId, kind],
    )
  ).rows;
  const byRound = new Map<number, string[]>();
  for (const row of rows) byRound.set(Number(row.round), [...(byRound.get(Number(row.round)) ?? []), row.id]);
  return byRound;
}

async function phaseRoundOffset(kind: string): Promise<number> {
  return Number(
    (
      await fixture.accounts.pool.query<{ round_offset: string | number }>(
        "SELECT round_offset FROM tournament_phases WHERE tournament_id=$1 AND kind=$2",
        [fixture.tournamentId, kind],
      )
    ).rows[0]!.round_offset,
  );
}

/** Every round number the ledger holds a row for, ascending. */
async function ledgerRounds(): Promise<number[]> {
  return (
    await fixture.accounts.pool.query<{ round_number: string | number }>(
      "SELECT DISTINCT round_number FROM tournament_result_ledger WHERE tournament_id=$1 ORDER BY round_number",
      [fixture.tournamentId],
    )
  ).rows.map((row) => Number(row.round_number));
}

async function playableMatchesInRound(round: number): Promise<PlayableMatch[]> {
  return (
    await fixture.accounts.pool.query<{ id: string; player0_account_id: string; player1_account_id: string }>(
      `SELECT id, player0_account_id, player1_account_id FROM tournament_matches
       WHERE tournament_id=$1 AND round=$2 AND status='pending' ORDER BY position`,
      [fixture.tournamentId, round],
    )
  ).rows.map((row) => ({
    matchId: row.id,
    accountIds: [row.player0_account_id, row.player1_account_id] as [string, string],
  }));
}

async function phaseCount(kind: string): Promise<number> {
  return Number(
    (
      await fixture.accounts.pool.query<{ count: string }>(
        "SELECT COUNT(*) count FROM tournament_phases WHERE tournament_id=$1 AND kind=$2",
        [fixture.tournamentId, kind],
      )
    ).rows[0]!.count,
  );
}

async function statusOf(): Promise<string> {
  return (
    await fixture.accounts.pool.query<{ status: string }>("SELECT status FROM tournaments WHERE id=$1", [
      fixture.tournamentId,
    ])
  ).rows[0]!.status;
}

async function topCutSizeOf(): Promise<number | null> {
  const value = (
    await fixture.accounts.pool.query<{ top_cut_size: string | number | null }>(
      "SELECT top_cut_size FROM tournaments WHERE id=$1",
      [fixture.tournamentId],
    )
  ).rows[0]!.top_cut_size;
  return value === null ? null : Number(value);
}

async function winnerAccountOf(): Promise<string | null> {
  return (
    (
      await fixture.accounts.pool.query<{ winner_account_id: string | null }>(
        "SELECT winner_account_id FROM tournaments WHERE id=$1",
        [fixture.tournamentId],
      )
    ).rows[0]!.winner_account_id ?? null
  );
}

async function accountOf(participantId: string): Promise<string | null> {
  return (
    (
      await fixture.accounts.pool.query<{ account_id: string | null }>(
        "SELECT account_id FROM tournament_participants WHERE id=$1",
        [participantId],
      )
    ).rows[0]?.account_id ?? null
  );
}

async function tournamentsWonOf(accountId: string | null): Promise<number> {
  if (!accountId) return 0;
  return Number(
    (
      await fixture.accounts.pool.query<{ tournaments_won: string | number }>(
        "SELECT tournaments_won FROM player_stats WHERE account_id=$1",
        [accountId],
      )
    ).rows[0]?.tournaments_won ?? 0,
  );
}

it("does not auto-start the Top Cut when rounds require manual release", async () => {
  fixture = await frozenField({ playerCount: 9, topCutSize: 4, wins: [3, 3, 2, 2, 1, 1, 1, 0, 0] });
  await fixture.accounts.pool.query("UPDATE tournaments SET round_start_mode='manual' WHERE id=$1", [
    fixture.tournamentId,
  ]);
  expect(await fixture.topCut.sweepFrozenSwissPhases(T0 + 5000)).toBe(0);
  expect(await fixture.topCut.startTopCut(fixture.tournamentId, T0 + 5000, true)).toEqual({
    ok: true,
    value: { kind: "awaiting_manual_start" },
  });
  expect(await fixture.elimination.bracket(fixture.tournamentId)).toBeUndefined();
  expect((await fixture.topCut.startTopCut(fixture.tournamentId, T0 + 10000)).ok).toBe(true);
  const bracket = (await fixture.elimination.bracket(fixture.tournamentId))!;
  expect(bracket.matches.filter((match) => match.status === "pending")).toHaveLength(0);
  expect(await fixture.elimination.startNextRound(fixture.tournamentId)).toBe(true);
  expect(
    (await fixture.elimination.bracket(fixture.tournamentId))!.matches.filter((match) => match.status === "pending"),
  ).toHaveLength(2);
});
