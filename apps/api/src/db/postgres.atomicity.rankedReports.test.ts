import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { ReplayCapturer } from "#api/bugs/replayCapture";
import { RED_DECK } from "#api/engine/testDecks";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { RankedReportStore } from "#api/ranked/RankedReportStore";
import { RankedSeasonStore } from "#api/ranked/RankedSeasonStore";
import { RankedStore } from "#api/ranked/RankedStore";
import { RankedRegion } from "@aegis/shared/ranked/RankedRegion";
import { RankedReportStatus } from "@aegis/shared/ranked/RankedReportStatus";
import { RANKED_REPORTS_PER_SEASON, RANKED_REPORT_WINDOW_MS } from "@aegis/shared/ranked/rankedReportLimits";

const connection = process.env.POSTGRES_TEST_URL ?? process.env.DATABASE_URL;
const schema = `ranked_reports_test_${randomUUID().replaceAll("-", "")}`;
const startedAt = Date.UTC(2026, 9, 20);
const region = RankedRegion.SOUTH_AMERICA.value;
const description = "My Digimon was deleted although it had a protection effect.";

describe("ranked game reports against Postgres", () => {
  let admin: Pool;
  let accounts: AccountStore;
  let queue: RankedStore;
  let reports: RankedReportStore;
  let winner: string;
  let loser: string;
  let outsider: string;
  let moderator: string;
  let winnerDeck: string;
  let loserDeck: string;

  beforeAll(async () => {
    if (!connection) {
      throw new Error("POSTGRES_TEST_URL required");
    }
    admin = new Pool({ connectionString: connection });
    await admin.query(`CREATE SCHEMA ${schema}`);
    accounts = new AccountStore(new Pool({ connectionString: connection, options: `-c search_path=${schema}` }));
    await accounts.ensureReady();
    winner = (await accounts.accountForIdentity("discord", "report-winner", "Report Winner")).id;
    loser = (await accounts.accountForIdentity("discord", "report-loser", "Report Loser")).id;
    outsider = (await accounts.accountForIdentity("discord", "report-outsider", "Report Outsider")).id;
    moderator = (await accounts.accountForIdentity("discord", "report-moderator", "Report Moderator")).id;
    winnerDeck = (await accounts.saveDeck(winner, { name: "Winner", ...RED_DECK })).id;
    loserDeck = (await accounts.saveDeck(loser, { name: "Loser", ...RED_DECK })).id;
  }, 60_000);

  beforeEach(async () => {
    await accounts.pool.query(
      "TRUNCATE ranked_game_reports,ranked_queue,ranked_pair_players,ranked_pairs,ranked_standings,ranked_ratings,ranked_rewards,ranked_discord,ranked_seasons,competitive_match_facts,account_active_rooms,match_records,notifications CASCADE",
    );
    queue = new RankedStore(accounts, async () => `room-${randomUUID()}`);
    reports = new RankedReportStore(accounts);
  });

  afterAll(async () => {
    await accounts?.close();
    await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin?.end();
  });

  async function playGame(draw = false): Promise<{ pairId: string; matchId: string; finishedAt: number }> {
    await queue.joinQueue({
      accountId: winner,
      deckId: winnerDeck,
      format: "BT10",
      region,
      slot: "blue",
      now: startedAt,
    });
    const second = await queue.joinQueue({
      accountId: loser,
      deckId: loserDeck,
      format: "BT10",
      region,
      slot: "blue",
      now: startedAt,
    });
    const first = await queue.pollQueue(winner, startedAt);
    const pairId = second.pairId!;
    const roomId = second.roomId!;
    await queue.claimSeat({ accountId: winner, pairId, roomId, token: first.token!, now: startedAt });
    await queue.claimSeat({ accountId: loser, pairId, roomId, token: second.token!, now: startedAt });
    expect(await queue.markPlaying(pairId, roomId, startedAt)).toBe(true);
    await accounts.recordMatch({
      roomId,
      rankedPairId: pairId,
      matchLogId: randomUUID(),
      format: "BT10",
      mode: "ranked",
      playerAccountIds: [winner, loser],
      winnerAccountId: draw ? undefined : winner,
      reason: "surrender",
    });
    const row = (
      await accounts.pool.query<{ result_id: string; finished_at: string }>(
        "SELECT p.result_id,m.finished_at FROM ranked_pairs p JOIN match_records m ON m.id=p.result_id WHERE p.id=$1",
        [pairId],
      )
    ).rows[0]!;
    return { pairId, matchId: row.result_id, finishedAt: Number(row.finished_at) };
  }

  async function getRating(accountId: string): Promise<number> {
    return (
      await accounts.pool.query<{ rating: number }>(
        "SELECT rating FROM ranked_ratings WHERE account_id=$1 AND format='BT10'",
        [accountId],
      )
    ).rows[0]!.rating;
  }

  async function getStanding(accountId: string) {
    return (
      await accounts.pool.query<{ rating: number; wins: number; losses: number; draws: number }>(
        "SELECT rating,wins,losses,draws FROM ranked_standings WHERE account_id=$1 AND format='BT10'",
        [accountId],
      )
    ).rows[0]!;
  }

  function fileReport(pairId: string, accountId = loser, now?: number) {
    return reports.fileReport({ accountId, pairId, description, turn: 7, now });
  }

  it("lets only the loser report a finished game, once, within 24 hours", async () => {
    const game = await playGame();
    await expect(fileReport(game.pairId, winner)).rejects.toThrow("ranked_report_not_loser");
    await expect(fileReport(game.pairId, outsider)).rejects.toThrow("ranked_report_not_found");
    await expect(fileReport(game.pairId, loser, game.finishedAt + RANKED_REPORT_WINDOW_MS + 1)).rejects.toThrow(
      "ranked_report_window_closed",
    );
    const overview = await reports.getOverview(loser, game.finishedAt + 1);
    expect(overview.reportable).toMatchObject([{ pairId: game.pairId, opponentName: "Report Winner" }]);
    expect((await reports.getOverview(winner, game.finishedAt + 1)).reportable).toEqual([]);
    await fileReport(game.pairId, loser, game.finishedAt + RANKED_REPORT_WINDOW_MS);
    await expect(fileReport(game.pairId)).rejects.toThrow("ranked_report_duplicate");
    const after = await reports.getOverview(loser, game.finishedAt + 1);
    expect(after.reportable).toEqual([]);
    expect(after.reports).toMatchObject([{ pairId: game.pairId, turn: 7, status: RankedReportStatus.PENDING.value }]);
  });

  it("refuses reports on a draw or on a finalized season", async () => {
    const draw = await playGame(true);
    await expect(fileReport(draw.pairId)).rejects.toThrow("ranked_report_not_loser");
    const game = await playGame();
    await accounts.pool.query("UPDATE ranked_seasons SET finalized=true");
    await expect(fileReport(game.pairId)).rejects.toThrow("ranked_report_season_finalized");
  });

  it("limits reports per season and counts confirmed and rejected reports", async () => {
    const playEvenGame = async () => {
      await accounts.pool.query("UPDATE ranked_ratings SET rating=1000");
      return playGame();
    };
    const reportIds: string[] = [];
    for (let index = 0; index < RANKED_REPORTS_PER_SEASON; index++) {
      reportIds.push(await fileReport((await playEvenGame()).pairId));
    }
    await reports.ruleReport({ reportId: reportIds[0]!, adminAccountId: moderator, ruling: "confirmed" });
    await reports.ruleReport({ reportId: reportIds[1]!, adminAccountId: moderator, ruling: "rejected" });
    const extra = await playEvenGame();
    await expect(fileReport(extra.pairId)).rejects.toThrow("ranked_report_limit_reached");
    const overview = await reports.getOverview(loser, extra.finishedAt + 1);
    expect(overview.used).toBe(RANKED_REPORTS_PER_SEASON);
    expect(overview.reportable[0]?.remainingReports).toBe(0);
  });

  it("voids a confirmed game by reverting exactly its Elo deltas, once, even under concurrent rulings", async () => {
    const reported = await playGame();
    const afterReported = { winner: await getRating(winner), loser: await getRating(loser) };
    await playGame();
    const before = { winner: await getRating(winner), loser: await getRating(loser) };
    expect(before.winner - afterReported.winner).not.toBe(afterReported.winner - 1000);
    await accounts.pool.query(
      "INSERT INTO competitive_match_facts (match_id,account_id,opponent_account_id,origin,format,archetype,opponent_archetype,classifier_version,result,finished_at) VALUES ($1,$2,$3,'ranked','BT10','unknown','unknown',0,'win',1)",
      [reported.matchId, winner, loser],
    );
    const reportId = await fileReport(reported.pairId);
    const rulings = await Promise.all(
      [1, 2, 3].map(() => reports.ruleReport({ reportId, adminAccountId: moderator, ruling: "confirmed" })),
    );
    expect(rulings).toEqual(["confirmed", "confirmed", "confirmed"]);
    expect(await getRating(winner)).toBe(before.winner - (afterReported.winner - 1000));
    expect(await getRating(loser)).toBe(before.loser - (afterReported.loser - 1000));
    expect(await getStanding(winner)).toMatchObject({ rating: await getRating(winner), wins: 1, losses: 0 });
    expect(await getStanding(loser)).toMatchObject({ rating: await getRating(loser), wins: 0, losses: 1 });
    expect(
      (await accounts.pool.query("SELECT 1 FROM competitive_match_facts WHERE match_id=$1", [reported.matchId]))
        .rowCount,
    ).toBe(0);
    expect(
      (await accounts.pool.query("SELECT voided_at FROM ranked_pairs WHERE id=$1", [reported.pairId])).rows[0]
        .voided_at,
    ).not.toBeNull();
    await expect(reports.ruleReport({ reportId, adminAccountId: moderator, ruling: "rejected" })).rejects.toThrow(
      "ranked_report_already_resolved",
    );
    expect(await getRating(winner)).toBe(before.winner - (afterReported.winner - 1000));
    const board = await new RankedSeasonStore(accounts).getLeaderboard({ format: "BT10", page: 1, accountId: loser });
    expect(board.mine).toMatchObject({ games: 1, losses: 1 });
  });

  it("keeps ratings and standings when a report is rejected", async () => {
    const game = await playGame();
    const before = { winner: await getStanding(winner), loser: await getStanding(loser) };
    const reportId = await fileReport(game.pairId);
    await reports.ruleReport({ reportId, adminAccountId: moderator, ruling: "rejected" });
    expect(await getStanding(winner)).toEqual(before.winner);
    expect(await getStanding(loser)).toEqual(before.loser);
    expect(
      (await accounts.pool.query("SELECT voided_at FROM ranked_pairs WHERE id=$1", [game.pairId])).rows[0].voided_at,
    ).toBeNull();
  });

  it("notifies the reporter and the opponent of the ruling with their Elo change", async () => {
    const confirmed = await playGame();
    const confirmedId = await fileReport(confirmed.pairId);
    await reports.ruleReport({ reportId: confirmedId, adminAccountId: moderator, ruling: "confirmed" });
    const rejected = await playGame();
    const rejectedId = await fileReport(rejected.pairId);
    await reports.ruleReport({ reportId: rejectedId, adminAccountId: moderator, ruling: "rejected" });
    const rows = (
      await accounts.pool.query<{ account_id: string; subject: string; payload: Record<string, unknown> }>(
        "SELECT account_id,subject,payload FROM notifications WHERE kind='ranked_report_ruling' ORDER BY id",
      )
    ).rows;
    expect(rows).toHaveLength(4);
    expect(
      rows.find((row) => row.account_id === loser && row.subject === `ranked_report:${confirmedId}`),
    ).toMatchObject({
      payload: { status: "confirmed", reporter: true, ratingChange: 16, opponentName: "Report Winner" },
    });
    expect(
      rows.find((row) => row.account_id === winner && row.subject === `ranked_report:${confirmedId}`),
    ).toMatchObject({
      payload: { status: "confirmed", reporter: false, ratingChange: -16, opponentName: "Report Loser" },
    });
    expect(rows.filter((row) => row.subject === `ranked_report:${rejectedId}`)).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ status: "rejected", ratingChange: null }) }),
      expect.objectContaining({ payload: expect.objectContaining({ status: "rejected", ratingChange: null }) }),
    ]);
  });

  it("keeps the captured match replay with the report for admin review", async () => {
    const game = await playGame();
    const matchLogId = (
      await accounts.pool.query<{ match_log_id: string }>("SELECT match_log_id FROM ranked_pairs WHERE id=$1", [
        game.pairId,
      ])
    ).rows[0]!.match_log_id;
    const record = {
      format: "aegis-replay-inputs/1",
      matchId: matchLogId,
      seed: 1,
      inputs: [],
    } as unknown as ReplayRecord;
    const requested: string[] = [];
    const capturer = new ReplayCapturer({
      logDir: "unused",
      extract: async (matchId) => {
        requested.push(matchId);
        return record;
      },
    });
    const reportId = await fileReport(game.pairId);
    expect(await reports.attachReplay({ reportId, capturer })).toBe(true);
    expect(requested).toEqual([matchLogId]);
    expect(await reports.listPending()).toMatchObject([
      {
        id: reportId,
        matchId: game.matchId,
        reporterName: "Report Loser",
        opponentName: "Report Winner",
        turn: 7,
        hasReplay: true,
      },
    ]);
    expect(await reports.getReplay(reportId)).toEqual(record);
  });

  it("waits for pending reports before finalizing the season", async () => {
    const game = await playGame();
    const seasons = new RankedSeasonStore(accounts);
    const season = (await seasons.getSeasons(startedAt))[0]!;
    const reportId = await fileReport(game.pairId);
    await seasons.finalizeSeasons(season.endsAt + 1);
    const isFinalized = async () =>
      (await accounts.pool.query("SELECT finalized FROM ranked_seasons WHERE id=$1", [season.id])).rows[0].finalized;
    expect(await isFinalized()).toBe(false);
    await reports.ruleReport({ reportId, adminAccountId: moderator, ruling: "rejected" });
    await seasons.finalizeSeasons(season.endsAt + 1);
    expect(await isFinalized()).toBe(true);
  });
});
