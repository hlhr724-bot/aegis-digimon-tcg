import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { LIVE_GAME_GRACE_MS } from "#api/tournaments/rules/liveGameGraceMs";
import { randomUUID } from "node:crypto";
import type { TournamentRules, TournamentStructure } from "@aegis/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import { createMemoryPool } from "../../db/memoryPool.fixture.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { inProcessTournamentLock } from "../participants/index.js";

import { SeriesStore } from "../series/index.js";
import { DeadlineQueue, type DeadlineKind } from "./DeadlineQueue.js";
import { DeadlineScheduler } from "./DeadlineScheduler.js";
import { startDeadlineWorker } from "./worker.js";

/**
 * What pg-mem can and cannot prove here.
 *
 * CAN: that the queue's SQL is valid, that a lease keeps a due row away from a second claim until
 * it lapses, that `executed_at IS NULL` counts an execution once, that every command re-reads the
 * state it acts on, and — the important one — that running the same command twice concurrently
 * leaves the tournament record identical to running it once. The last is the guarantee a fixed-slot
 * rollout actually depends on.
 *
 * CANNOT: anything about `FOR UPDATE SKIP LOCKED` itself. pg-mem parses the clause and ignores it
 * — no row locks, no skipping — so under these tests it is an ordinary SELECT, and two workers
 * sharing a database really can claim the same row. That is why the concurrency tests below assert
 * on the RESULT (one win recorded, one row retired) rather than on exclusion, and why the
 * in-process lock seam exists: it is the half a single test process can observe. Whether Postgres
 * hands two containers disjoint rows is a contract of the database, not of this code.
 *
 * It also cannot prove the `FOR UPDATE` that `SeriesStore` takes on the match row, which is what
 * makes the presence re-check atomic in production. What these tests DO prove is the half that is
 * this module's own: that the decision travels into the command as `expectedAbsentSeats` and is
 * refused — not applied — when presence no longer matches it.
 *
 * ## The timeline these tests pin
 *
 * The manual is ambiguous and a product cannot be, so:
 *
 *  - `join_deadline_at = round published_at + joinGraceMs`. That is the "join by" instant the UI
 *    counts down to, and the value the round publisher writes.
 *  - `gameLossAtMs` and `matchLossAtMs` are offsets from PUBLICATION, not from the join deadline.
 *    The scheduler derives `base = join_deadline_at - joinGraceMs` and schedules from there.
 *  - Boundaries are INCLUSIVE: a rung applies at exactly its instant.
 *
 * With the official preset (grace = game loss = 5 min, match loss = 10 min) that puts the game
 * loss exactly on `join_deadline_at` and the match loss five minutes after it — the manual's "game
 * loss at 5 minutes late, match loss at 10". The `publishRound → ladder` test below is the one
 * that pins the arithmetic end to end.
 */

const PUBLISHED_AT = 1_000_000;
const GRACE_MS = buildTournamentRules({ bestOf: 3 }).attendance.joinGraceMs;
const GAME_LOSS_MS = buildTournamentRules({ bestOf: 3 }).attendance.gameLossAtMs!;
const MATCH_LOSS_MS = buildTournamentRules({ bestOf: 3 }).attendance.matchLossAtMs;
const JOIN_DEADLINE_AT = PUBLISHED_AT + GRACE_MS;
const GAME_LOSS_AT = PUBLISHED_AT + GAME_LOSS_MS;
const MATCH_LOSS_AT = PUBLISHED_AT + MATCH_LOSS_MS;
const SWISS_RULES = buildTournamentRules({ bestOf: 3 });
const SWISS_DURATION_MS = SWISS_RULES.match.swissDurationMs!;

type Fixture = {
  accounts: AccountStore;
  series: SeriesStore;
  scheduler: DeadlineScheduler;
  queue: DeadlineQueue;
  tournamentId: string;
  matchId: string;
  alice: string;
  bob: string;
};

let fixture: Fixture;

/** One cache for this file: an arrangement is built once and restored for every test that reuses it. */
const fixtureFor = snapshotFixtures<Fixture>();

async function build(options?: {
  structure?: TournamentStructure;
  rules?: TournamentRules;
  seats?: "both" | "bot_opponent" | "empty";
}): Promise<Fixture> {
  return fixtureFor(JSON.stringify(options ?? {}), (pool) => buildOn(pool, options));
}

async function buildOn(
  pool: Pool,
  options?: { structure?: TournamentStructure; rules?: TournamentRules; seats?: "both" | "bot_opponent" | "empty" },
): Promise<Fixture> {
  const accounts = new AccountStore(pool);
  const series = new SeriesStore(accounts, inProcessTournamentLock());
  const queue = new DeadlineQueue(accounts);
  const scheduler = new DeadlineScheduler(accounts, series, queue);
  const alice = (await accounts.accountForIdentity("discord", "alice", "Alice")).id;
  const bob = (await accounts.accountForIdentity("discord", "bob", "Bob")).id;
  const tournament = await accounts.createTournament(alice, {
    name: "Deadline Cup",
    block: "BT10",
    startsAt: PUBLISHED_AT,
    maxPlayers: 8,
    structure: options?.structure ?? "swiss",
    bestOf: 3,
    rules: options?.rules ?? SWISS_RULES,
  });
  const seats = options?.seats ?? "both";
  const matchId = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, round, position, player0_account_id, player1_account_id, status, join_deadline_at)
     VALUES ($1,$2,1,0,$3,$4,'pending',$5)`,
    [matchId, tournament.id, seats === "empty" ? null : alice, seats === "both" ? bob : null, JOIN_DEADLINE_AT],
  );
  for (const accountId of [alice, bob]) await freezeParticipant(accounts, tournament.id, accountId);
  if (seats === "bot_opponent") await seatBot(accounts, tournament.id);
  return { accounts, series, scheduler, queue, tournamentId: tournament.id, matchId, alice, bob };
}

async function freezeParticipant(accounts: AccountStore, tournamentId: string, accountId: string): Promise<void> {
  await accounts.pool.query(
    `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, created_at)
     VALUES ($1,$2,'human',$3,'Player','active',$4,1)`,
    [
      randomUUID(),
      tournamentId,
      accountId,
      JSON.stringify({ deckId: "frozen", name: "Frozen", mainDeck: ["BT1-001"], eggDeck: ["BT1-002"], revision: 1 }),
    ],
  );
}

/** A bot participant: no account, so it can never mark itself present. */
async function seatBot(accounts: AccountStore, tournamentId: string): Promise<void> {
  await accounts.pool.query(
    `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, created_at)
     VALUES ($1,$2,'bot',NULL,'Bot','active',1)`,
    [randomUUID(), tournamentId],
  );
}

/**
 * What round publication does: write `join_deadline_at` and arm the ladder. C3's `publishRound`
 * owns the first half in production; this is the same contract expressed locally, because that
 * module is not in this tree yet (see the branch report).
 */
async function publishRound(publishedAt = PUBLISHED_AT, graceMs = GRACE_MS): Promise<boolean> {
  const joinDeadlineAt = publishedAt + graceMs;
  await fixture.accounts.pool.query("UPDATE tournament_matches SET join_deadline_at=$1 WHERE id=$2", [
    joinDeadlineAt,
    fixture.matchId,
  ]);
  return fixture.scheduler.enqueueJoinDeadline({
    tournamentId: fixture.tournamentId,
    matchId: fixture.matchId,
    dueAt: joinDeadlineAt,
    now: publishedAt,
  });
}

async function arrive(accountId: string, now: number, winsRequired = SWISS_RULES.match.winsRequired): Promise<void> {
  const marked = await fixture.series.markPresent({
    tournamentId: fixture.tournamentId,
    matchId: fixture.matchId,
    accountId,
    winsRequired,
    seriesDurationMs: SWISS_DURATION_MS,
    now,
  });
  if (!marked.ok) throw new Error(`markPresent failed: ${marked.reason}`);
}

async function startPlaying(seriesId: string, roomId: string, now: number): Promise<string> {
  const authorized = await fixture.series.authorizeNextGame({ seriesId, accountId: fixture.alice, now });
  if (!authorized.ok) throw new Error(`authorizeNextGame failed: ${authorized.reason}`);
  const claimed = await fixture.series.claimGame({
    gameId: authorized.value.gameId,
    authorizationToken: authorized.value.token,
    roomId,
    now,
  });
  if (!claimed.ok) throw new Error(`claimGame failed: ${claimed.reason}`);
  await fixture.series.markGamePlaying(authorized.value.gameId, roomId);
  return authorized.value.gameId;
}

async function resultOf(kind: DeadlineKind): Promise<string | null | undefined> {
  return (await fixture.queue.find(kind, fixture.matchId))?.result;
}

beforeEach(async () => {
  fixture = await build();
});

describe("the published timeline", () => {
  it("arms the ladder at publication + gameLossAtMs and publication + matchLossAtMs", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);

    const gameLossRung = await fixture.queue.find("join_game_loss", fixture.matchId);
    expect(gameLossRung?.dueAt).toBe(GAME_LOSS_AT);
    // The official preset makes the grace and the game-loss threshold equal, so the first penalty
    // lands exactly on the join deadline the UI counted down to.
    expect(gameLossRung?.dueAt).toBe(JOIN_DEADLINE_AT);

    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);
    expect((await fixture.queue.find("join_match_loss", fixture.matchId))?.dueAt).toBe(MATCH_LOSS_AT);
    expect(MATCH_LOSS_AT - PUBLISHED_AT).toBe(10 * 60_000);
  });

  it("keeps the offsets measured from publication when the grace differs from the game loss", async () => {
    fixture = await build({
      rules: { ...SWISS_RULES, attendance: { joinGraceMs: 60_000, gameLossAtMs: 300_000, matchLossAtMs: 600_000 } },
    });
    // A one-minute grace puts the join deadline a minute after publication; the game loss stays
    // five minutes after PUBLICATION, not six.
    await publishRound(PUBLISHED_AT, 60_000);

    expect((await fixture.queue.find("join_game_loss", fixture.matchId))?.dueAt).toBe(PUBLISHED_AT + 300_000);
  });
});

describe("the due boundary", () => {
  it("leaves a rung alone one millisecond early and fires it exactly on the instant", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);

    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT - 1)).toBe(0);
    expect(await resultOf("join_game_loss")).toBeNull();

    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT)).toBe(1);
    expect(await resultOf("join_game_loss")).toBe("game_loss_applied");
  });

  it("never executes the same row twice", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);

    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT)).toBe(1);
    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT + 1)).toBe(0);
  });
});

describe("the attendance ladder", () => {
  it("charges a game loss and then the match to a player who never arrives", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);

    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);
    const afterGameLoss = await fixture.series.seriesForMatch(fixture.matchId);
    expect(afterGameLoss?.wins).toEqual([1, 0]);
    expect(afterGameLoss?.status).toBe("playing");
    expect(afterGameLoss?.games.map((game) => game.resultReason)).toEqual(["administrative_game_loss_no_show"]);

    await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);
    expect(await resultOf("join_match_loss")).toBe("match_loss_applied");
    const resolved = await fixture.series.seriesForMatch(fixture.matchId);
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.officialResult).toBe("participant0");
    expect(resolved?.resolutionReason).toBe("administrative_match_loss_no_show");
  });

  /**
   * The manual's warning has no representation here, and needs none. Presence is first-arrival-wins
   * and is never cleared, so a player who turned up late but inside the grace is simply present and
   * this rung never runs against them: "warned" and "penalised" cannot both be true of one player.
   */
  it("penalises nobody who arrived at all, however late within the grace", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT + 1_000);
    await arrive(fixture.bob, GAME_LOSS_AT - 1);

    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);
    expect(await resultOf("join_game_loss")).toBe("cancelled_both_present");
  });

  it("cancels the match-loss rung when the absentee arrives after losing a game", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);
    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);

    await arrive(fixture.bob, GAME_LOSS_AT + 1_000);

    await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);
    expect(await resultOf("join_match_loss")).toBe("cancelled_both_present");
    const series = await fixture.series.seriesForMatch(fixture.matchId);
    expect(series?.wins).toEqual([1, 0]);
    expect(series?.status).toBe("playing");
  });

  it("cancels the ladder outright when both players are already present", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000);

    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);
    expect(await resultOf("join_game_loss")).toBe("cancelled_both_present");
    expect(await fixture.queue.find("join_match_loss", fixture.matchId)).toBeUndefined();
  });

  it("refuses the penalty rather than killing a series that started under it", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);
    const rung = (await fixture.queue.find("join_game_loss", fixture.matchId))!;

    // The scheduler decided on "seat 1 is absent"; by the time the command runs, it is not.
    await arrive(fixture.bob, GAME_LOSS_AT);
    const refused = await fixture.series.recordAdministrativeGameLoss({
      tournamentId: fixture.tournamentId,
      matchId: fixture.matchId,
      loserAccountId: fixture.bob,
      commandId: rung.id,
      reason: "administrative_game_loss_no_show",
      winsRequired: 2,
      seriesDurationMs: SWISS_DURATION_MS,
      expectedAbsentSeats: [1],
      now: GAME_LOSS_AT,
    });

    expect(refused).toEqual({ ok: false, reason: "presence_changed" });
    expect((await fixture.series.seriesForMatch(fixture.matchId))?.wins).toEqual([0, 0]);
  });

  it("leaves a rung unexecuted and due again when presence changed under it", async () => {
    await publishRound();
    const rung = (await fixture.queue.find("join_game_loss", fixture.matchId))!;
    await fixture.queue.claimDue(GAME_LOSS_AT, "worker");
    await fixture.queue.releaseLease(rung.id);

    const pending = await fixture.queue.pending(GAME_LOSS_AT);
    expect(pending.map((row) => row.id)).toEqual([rung.id]);
    expect(pending[0]?.leaseExpiresAt).toBeNull();
  });
});

describe("a double no-show", () => {
  it("charges nobody at the game-loss rung and still arms the match loss", async () => {
    await publishRound();

    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT)).toBe(1);
    expect(await resultOf("join_game_loss")).toBe("both_absent_no_penalty");
    expect(await fixture.series.seriesForMatch(fixture.matchId)).toBeUndefined();
    expect((await fixture.queue.find("join_match_loss", fixture.matchId))?.dueAt).toBe(MATCH_LOSS_AT);
  });

  it("is still winnable by whoever turns up before the match-loss rung", async () => {
    await publishRound();
    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);

    await arrive(fixture.alice, GAME_LOSS_AT + 1_000);
    await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);

    expect(await resultOf("join_match_loss")).toBe("match_loss_applied");
    const series = await fixture.series.seriesForMatch(fixture.matchId);
    expect(series?.officialResult).toBe("participant0");
  });

  it("resolves by the Swiss tie rule in the snapshot once the match-loss rung is reached", async () => {
    await publishRound();
    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);

    await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);
    expect(await resultOf("join_match_loss")).toBe("double_no_show_resolved");
    const series = await fixture.series.seriesForMatch(fixture.matchId);
    expect(series?.status).toBe("resolved");
    expect(series?.officialResult).toBe("draw");
  });

  it("resolves as a double loss when the snapshot says so", async () => {
    fixture = await build({ rules: { ...SWISS_RULES, timeout: { ...SWISS_RULES.timeout, swiss: "double_loss" } } });
    await publishRound();
    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);

    await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);
    expect((await fixture.series.seriesForMatch(fixture.matchId))?.officialResult).toBe("double_loss");
  });

  it("escalates in elimination instead of inventing who advances", async () => {
    fixture = await build({ structure: "single_elimination", rules: buildTournamentRules({ bestOf: 3 }) });
    await publishRound();
    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);

    await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);
    expect(await resultOf("join_match_loss")).toBe("double_no_show_needs_organizer_decision");
    const series = await fixture.series.seriesForMatch(fixture.matchId);
    expect(series?.status).toBe("needs_organizer_decision");
    expect(series?.officialResult).toBeNull();
  });
});

describe("seats nobody can arrive at", () => {
  it("treats a bot's seat as present, so its opponent is the only one who can be late", async () => {
    fixture = await build({ seats: "bot_opponent" });
    await publishRound();

    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);
    expect(await resultOf("join_game_loss")).toBe("game_loss_applied");
    expect((await fixture.series.seriesForMatch(fixture.matchId))?.wins).toEqual([0, 1]);
  });

  it("never counts a bot as absent, so the human present at the table cannot be given a no-show win", async () => {
    fixture = await build({ seats: "bot_opponent" });
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);

    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);
    expect(await resultOf("join_game_loss")).toBe("cancelled_both_present");
  });

  it("penalises nobody when the empty seat is a bye rather than a bot", async () => {
    fixture = await build({ seats: "empty" });
    await publishRound();

    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT)).toBe(1);
    expect(await resultOf("join_game_loss")).toBe("skipped_no_opponent");
    expect(await fixture.series.seriesForMatch(fixture.matchId)).toBeUndefined();
  });
});

describe("the shared clock", () => {
  it("queues its own deadline in the transaction that starts the series", async () => {
    await arrive(fixture.alice, PUBLISHED_AT);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000);
    const series = await fixture.series.seriesForMatch(fixture.matchId);

    const queued = await fixture.queue.find("series_deadline", series!.id);
    expect(queued?.dueAt).toBe(series!.seriesDeadlineAt);
    expect(series!.seriesDeadlineAt).toBe(PUBLISHED_AT + 1_000 + SWISS_DURATION_MS);
  });

  it("queues nothing for an untimed format", async () => {
    for (const [accountId, now] of [
      [fixture.alice, PUBLISHED_AT],
      [fixture.bob, PUBLISHED_AT + 1_000],
    ] as const)
      await fixture.series.markPresent({
        tournamentId: fixture.tournamentId,
        matchId: fixture.matchId,
        accountId,
        winsRequired: 2,
        seriesDurationMs: null,
        now,
      });
    const series = await fixture.series.seriesForMatch(fixture.matchId);

    expect(series!.seriesDeadlineAt).toBeNull();
    expect(await fixture.queue.find("series_deadline", series!.id)).toBeUndefined();
  });

  it("draws a tied Swiss series when the clock runs out", async () => {
    await arrive(fixture.alice, PUBLISHED_AT);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000);
    const due = PUBLISHED_AT + 1_000 + SWISS_DURATION_MS;

    expect(await fixture.scheduler.processDueDeadlines(due)).toBe(1);
    const series = await fixture.series.seriesForMatch(fixture.matchId);
    expect(series?.status).toBe("resolved");
    expect(series?.officialResult).toBe("draw");
  });

  it("parks a tied elimination series for an organizer instead of picking a winner", async () => {
    fixture = await build({ structure: "single_elimination", rules: buildTournamentRules({ bestOf: 3 }) });
    await arrive(fixture.alice, PUBLISHED_AT);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000);
    const series = await fixture.series.seriesForMatch(fixture.matchId);

    await fixture.scheduler.processDueDeadlines(series!.seriesDeadlineAt!);
    expect((await fixture.queue.find("series_deadline", series!.id))?.result).toBe("series_needs_organizer_decision");
    expect((await fixture.series.series(series!.id))?.status).toBe("needs_organizer_decision");
  });

  it("keeps a clock row for later rather than retiring it before its instant", async () => {
    await arrive(fixture.alice, PUBLISHED_AT);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000);
    const series = (await fixture.series.seriesForMatch(fixture.matchId))!;
    // Simulates the row coming due against a clock that has since moved: nothing may retire it.
    await fixture.accounts.pool.query("UPDATE tournament_deadlines SET due_at=$1 WHERE subject_id=$2", [
      PUBLISHED_AT,
      series.id,
    ]);

    expect(await fixture.scheduler.processDueDeadlines(PUBLISHED_AT + 2_000)).toBe(0);
    const row = await fixture.queue.find("series_deadline", series.id);
    expect(row?.executedAt).toBeNull();
    expect(row?.leaseExpiresAt).toBeNull();
  });

  it("retires the clock when the confrontation is decided before it", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);
    await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT);
    const series = (await fixture.series.seriesForMatch(fixture.matchId))!;

    await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);

    expect((await fixture.queue.find("series_deadline", series.id))?.result).toBe("cancelled_series_closed");
    expect(await fixture.scheduler.processDueDeadlines(series.seriesDeadlineAt!)).toBe(0);
  });

  it("voids the authorization that could still open a room for a game the clock just ended", async () => {
    await arrive(fixture.alice, PUBLISHED_AT);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000);
    const series = (await fixture.series.seriesForMatch(fixture.matchId))!;
    const authorized = await fixture.series.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: PUBLISHED_AT + 2_000,
    });
    if (!authorized.ok) throw new Error(authorized.reason);

    await fixture.scheduler.processDueDeadlines(series.seriesDeadlineAt!);

    const claimed = await fixture.series.claimGame({
      gameId: authorized.value.gameId,
      authorizationToken: authorized.value.token,
      roomId: "room-1",
      now: series.seriesDeadlineAt!,
    });
    expect(claimed).toEqual({ ok: false, reason: "authorization_expired" });
  });
});

describe("a game still being played when the clock runs out", () => {
  async function eliminationSeries(winsRequired: number) {
    fixture = await build({ structure: "single_elimination", rules: buildTournamentRules({ bestOf: 3 }) });
    await arrive(fixture.alice, PUBLISHED_AT, winsRequired);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000, winsRequired);
    const series = (await fixture.series.seriesForMatch(fixture.matchId))!;
    const gameId = await startPlaying(series.id, "room-live", PUBLISHED_AT + 2_000);
    return { series, gameId, deadline: series.seriesDeadlineAt! };
  }

  it("lets the game finish and decides the best-of-one confrontation by its result", async () => {
    const { series, gameId, deadline } = await eliminationSeries(1);

    expect(await fixture.scheduler.processDueDeadlines(deadline)).toBe(0);
    expect((await fixture.series.series(series.id))?.status).toBe("overtime");
    expect((await fixture.series.series(series.id))?.games[0]?.status).toBe("playing");

    const recorded = await fixture.series.recordGameResult({
      gameId,
      roomId: "room-live",
      outcome: { kind: "winner", winnerAccountId: fixture.alice },
      finishedAt: deadline + 164_000,
    });

    expect(recorded.ok && recorded.value.status).toBe("resolved");
    expect(recorded.ok && recorded.value.officialResult).toBe("participant0");
    expect((await fixture.queue.find("series_deadline", series.id))?.result).toBe("cancelled_series_closed");
  });

  it("postpones the clock row to the end of the grace instead of retrying it every pass", async () => {
    const { series, deadline } = await eliminationSeries(1);

    await fixture.scheduler.processDueDeadlines(deadline);

    const row = await fixture.queue.find("series_deadline", series.id);
    expect(row?.executedAt).toBeNull();
    expect(row?.leaseExpiresAt).toBeNull();
    expect(row?.dueAt).toBe(deadline + LIVE_GAME_GRACE_MS);
    expect(await fixture.scheduler.processDueDeadlines(deadline + LIVE_GAME_GRACE_MS - 1)).toBe(0);
  });

  it("decides on the score as soon as an overtime game ends without deciding the confrontation", async () => {
    const { series, gameId, deadline } = await eliminationSeries(2);
    await fixture.scheduler.processDueDeadlines(deadline);
    const finishedAt = deadline + 60_000;

    await fixture.series.recordGameResult({
      gameId,
      roomId: "room-live",
      outcome: { kind: "winner", winnerAccountId: fixture.alice },
      finishedAt,
    });
    const refused = await fixture.series.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.bob,
      now: finishedAt,
    });

    expect(refused).toEqual({ ok: false, reason: "no_games_remaining" });
    expect((await fixture.queue.find("series_deadline", series.id))?.dueAt).toBe(finishedAt);
    expect(await fixture.scheduler.processDueDeadlines(finishedAt)).toBe(1);
    const resolved = await fixture.series.series(series.id);
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolutionReason).toBe("deadline_ahead_on_games");
    expect(resolved?.officialResult).toBe("participant0");
  });

  it("voids the game and parks the tie for an organizer once the grace runs out", async () => {
    const { series, deadline } = await eliminationSeries(1);
    await fixture.scheduler.processDueDeadlines(deadline);

    expect(await fixture.scheduler.processDueDeadlines(deadline + LIVE_GAME_GRACE_MS)).toBe(1);

    const parked = await fixture.series.series(series.id);
    expect(parked?.status).toBe("needs_organizer_decision");
    expect(parked?.games[0]?.status).toBe("voided");
    expect((await fixture.queue.find("series_deadline", series.id))?.result).toBe("series_needs_organizer_decision");
  });

  it("does not wait for a room that was claimed but never started", async () => {
    fixture = await build({ structure: "single_elimination", rules: buildTournamentRules({ bestOf: 3 }) });
    await arrive(fixture.alice, PUBLISHED_AT, 1);
    await arrive(fixture.bob, PUBLISHED_AT + 1_000, 1);
    const series = (await fixture.series.seriesForMatch(fixture.matchId))!;
    const authorized = await fixture.series.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: PUBLISHED_AT + 2_000,
    });
    if (!authorized.ok) throw new Error(authorized.reason);
    await fixture.series.claimGame({
      gameId: authorized.value.gameId,
      authorizationToken: authorized.value.token,
      roomId: "room-idle",
      now: PUBLISHED_AT + 2_000,
    });

    expect(await fixture.scheduler.processDueDeadlines(series.seriesDeadlineAt!)).toBe(1);
    expect((await fixture.series.series(series.id))?.status).toBe("needs_organizer_decision");
  });
});

describe("leases and recovery", () => {
  it("keeps a claimed row away from a second worker until its lease lapses", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);
    const claimed = await fixture.queue.claimDue(GAME_LOSS_AT, "worker-that-dies");
    expect(claimed).toHaveLength(1);

    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT)).toBe(0);

    await fixture.queue.expireLease(claimed[0]!.id, GAME_LOSS_AT);
    expect(await fixture.scheduler.processDueDeadlines(GAME_LOSS_AT)).toBe(1);
    expect(await resultOf("join_game_loss")).toBe("game_loss_applied");
  });

  it("gives two schedulers sharing a queue exactly one execution between them", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);
    const twin = new DeadlineScheduler(fixture.accounts, fixture.series, fixture.queue);

    const counts = await Promise.all([
      fixture.scheduler.processDueDeadlines(GAME_LOSS_AT),
      twin.processDueDeadlines(GAME_LOSS_AT),
    ]);
    expect(counts.reduce((total, count) => total + count, 0)).toBe(1);
  });

  it("applies an overdue backlog on startup rather than waiting for an interval", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);
    const muchLater = MATCH_LOSS_AT + 60 * 60_000;

    const worker = startDeadlineWorker({ scheduler: fixture.scheduler, intervalMs: 60_000, clock: () => muchLater });
    await worker.stop();

    expect(await resultOf("join_game_loss")).toBe("game_loss_applied");
    expect(await fixture.queue.find("join_match_loss", fixture.matchId)).toBeDefined();
  });
});

/**
 * Two API containers, two sets of stores, one database — the shape of overlapping fixed slots. They
 * share no in-process lock, exactly as two processes would not, so this is the case where both may
 * genuinely run the same command. What must hold is that the tournament record cannot tell.
 */
describe("fixed-slot overlap", () => {
  it("applies a no-show penalty once even when both slots run the command", async () => {
    await publishRound();
    await arrive(fixture.alice, PUBLISHED_AT);

    const green = new AccountStore(fixture.accounts.pool);
    const greenScheduler = new DeadlineScheduler(green, new SeriesStore(green, inProcessTournamentLock()));

    const counts = await Promise.all([
      fixture.scheduler.processDueDeadlines(GAME_LOSS_AT),
      greenScheduler.processDueDeadlines(GAME_LOSS_AT),
    ]);

    expect(counts.reduce((total, count) => total + count, 0)).toBe(1);
    const series = await fixture.series.seriesForMatch(fixture.matchId);
    expect(series?.wins).toEqual([1, 0]);
    expect(series?.games).toHaveLength(1);
    const matchLossRungs = await fixture.accounts.pool.query(
      "SELECT id FROM tournament_deadlines WHERE kind='join_match_loss' AND subject_id=$1",
      [fixture.matchId],
    );
    expect(matchLossRungs.rowCount).toBe(1);
  });
});

describe("events the scheduler must not act on", () => {
  it("records that a tournament with no frozen ruleset was skipped rather than guessing one", async () => {
    const accounts = new AccountStore(createMemoryPool());
    const series = new SeriesStore(accounts, inProcessTournamentLock());
    const queue = new DeadlineQueue(accounts);
    const scheduler = new DeadlineScheduler(accounts, series, queue);
    const organizer = (await accounts.accountForIdentity("discord", "legacy", "Legacy")).id;
    const tournament = await accounts.createTournament(organizer, {
      name: "Legacy Cup",
      block: "BT10",
      startsAt: PUBLISHED_AT,
      maxPlayers: 8,
    });
    const matchId = randomUUID();
    await accounts.pool.query(
      `INSERT INTO tournament_matches (id, tournament_id, round, position, status, join_deadline_at)
       VALUES ($1,$2,1,0,'pending',$3)`,
      [matchId, tournament.id, JOIN_DEADLINE_AT],
    );

    // A legacy event has no snapshot to read the ladder's offsets out of, so no ladder is armed.
    expect(
      await scheduler.enqueueJoinDeadline({
        tournamentId: tournament.id,
        matchId,
        dueAt: JOIN_DEADLINE_AT,
        now: PUBLISHED_AT,
      }),
    ).toBe(false);
    expect(await queue.pending(MATCH_LOSS_AT)).toEqual([]);
  });

  it("refuses to arm the same ladder twice", async () => {
    expect(await publishRound()).toBe(true);
    expect(await publishRound(PUBLISHED_AT + 1)).toBe(false);
    expect((await fixture.queue.find("join_game_loss", fixture.matchId))?.dueAt).toBe(GAME_LOSS_AT);
  });

  it("arms ladders from the sweep for published matches and never re-arms them", async () => {
    // The worker's reconciliation pass — round publication cannot reach this queue's module, so
    // this sweep is what actually arms ladders in production, one tick after publication.
    expect(await fixture.scheduler.armPendingJoinLadders(PUBLISHED_AT + 1)).toBe(1);
    expect((await fixture.queue.find("join_game_loss", fixture.matchId))?.dueAt).toBe(GAME_LOSS_AT);
    // A second pass finds the ladder (even a retired one) and arms nothing.
    expect(await fixture.scheduler.armPendingJoinLadders(PUBLISHED_AT + 2)).toBe(0);
  });
});

it("retires attendance deadlines without penalties after cancellation", async () => {
  await publishRound();
  await arrive(fixture.alice, PUBLISHED_AT);
  await fixture.accounts.pool.query("UPDATE tournaments SET status='cancelled' WHERE id=$1", [fixture.tournamentId]);
  await fixture.scheduler.processDueDeadlines(MATCH_LOSS_AT);
  expect(await resultOf("join_game_loss")).toBe("skipped_tournament_closed");
  expect(await fixture.series.seriesForMatch(fixture.matchId)).toBeUndefined();
  expect((await fixture.accounts.tournament(fixture.tournamentId))?.status).toBe("cancelled");
});
