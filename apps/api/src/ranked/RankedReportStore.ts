import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { ReplayCapturer } from "#api/bugs/replayCapture";
import { logError } from "#api/logger";
import { notify } from "#api/notifications/NotificationStore";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { getRankedSeason } from "#api/ranked/getRankedSeason";
import { runRankedTransaction } from "#api/ranked/runRankedTransaction";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import type {
  RankedAdminReport,
  RankedGameReport,
  RankedReportOverview,
  RankedReportableGame,
} from "@aegis/shared/ranked/RankedContracts";
import { RankedQueueStatus } from "@aegis/shared/ranked/RankedQueueStatus";
import { RankedReportStatus, type RankedReportRuling } from "@aegis/shared/ranked/RankedReportStatus";
import { RANKED_REPORTS_PER_SEASON, RANKED_REPORT_WINDOW_MS } from "@aegis/shared/ranked/rankedReportLimits";

type FileParams = { accountId: string; pairId: string; description: string; turn: number; now?: number };
type RuleParams = { reportId: string; adminAccountId: string; ruling: RankedReportRuling; now?: number };
type AttachReplayParams = { reportId: string; capturer: ReplayCapturer };
type ReportRow = {
  id: string;
  pair_id: string;
  season_id: number;
  reporter_account_id: string;
  description: string;
  turn: number;
  status: RankedReportStatus;
  created_at: string;
  resolved_at: string | null;
};
type GameRow = {
  status: string;
  format: DeckFormat;
  season_id: number;
  result_id: string;
  voided_at: string | null;
  winner_account_id: string | null;
  finished_at: string;
  finalized: boolean;
  participant: string | null;
};
type SeatRow = {
  account_id: string;
  display_name: string;
  rating_before: number | null;
  rating_after: number | null;
  peak_before: number | null;
};
type RevertParams = { db: PoolClient; seat: SeatRow; seasonId: number; format: DeckFormat; result: GameResult };
type GameResult = { wins: number; losses: number; draws: number };
type GameResultParams = { accountId: string; winnerAccountId: string | null };

const LIST_LIMIT = 20;

export class RankedReportStore {
  constructor(private readonly accounts: AccountStore) {}

  async getOverview(accountId: string, now = Date.now()): Promise<RankedReportOverview> {
    await this.accounts.ensureReady();
    const pool = this.accounts.pool;
    const seasonId = getRankedSeason(now).id;
    const usage = new Map(
      (
        await pool.query<{ season_id: number; used: string }>(
          "SELECT season_id,COUNT(*) AS used FROM ranked_game_reports WHERE reporter_account_id=$1 GROUP BY season_id",
          [accountId],
        )
      ).rows.map((row) => [row.season_id, Number(row.used)]),
    );
    const reportable = (
      await pool.query<{
        pair_id: string;
        season_id: number;
        format: DeckFormat;
        opponent_name: string;
        finished_at: string;
      }>(
        `SELECT p.id AS pair_id,p.season_id,p.format,a.display_name AS opponent_name,m.finished_at
         FROM ranked_pairs p
         JOIN match_records m ON m.id=p.result_id
         JOIN ranked_seasons s ON s.id=p.season_id
         JOIN ranked_pair_players me ON me.pair_id=p.id AND me.account_id=$1
         JOIN ranked_pair_players o ON o.pair_id=p.id AND o.account_id<>$1
         JOIN accounts a ON a.id=o.account_id
         LEFT JOIN ranked_game_reports r ON r.pair_id=p.id
         WHERE p.status=$2 AND p.voided_at IS NULL AND s.finalized=false AND r.id IS NULL
           AND m.winner_account_id=o.account_id AND m.finished_at>=$3
         ORDER BY m.finished_at DESC LIMIT ${LIST_LIMIT}`,
        [accountId, RankedQueueStatus.FINISHED.value, now - RANKED_REPORT_WINDOW_MS],
      )
    ).rows.map((row): RankedReportableGame => ({
      pairId: row.pair_id,
      seasonId: row.season_id,
      format: row.format,
      opponentName: row.opponent_name,
      finishedAt: Number(row.finished_at),
      reportDeadline: Number(row.finished_at) + RANKED_REPORT_WINDOW_MS,
      remainingReports: Math.max(0, RANKED_REPORTS_PER_SEASON - (usage.get(row.season_id) ?? 0)),
    }));
    const reports = (
      await pool.query<ReportRow & { format: DeckFormat; opponent_name: string; rating_change: number | null }>(
        `SELECT r.*,p.format,a.display_name AS opponent_name,
           CASE WHEN r.status=$2 THEN me.rating_before-me.rating_after ELSE NULL END AS rating_change
         FROM ranked_game_reports r
         JOIN ranked_pairs p ON p.id=r.pair_id
         JOIN ranked_pair_players me ON me.pair_id=p.id AND me.account_id=$1
         JOIN ranked_pair_players o ON o.pair_id=p.id AND o.account_id<>$1
         JOIN accounts a ON a.id=o.account_id
         WHERE r.reporter_account_id=$1
         ORDER BY r.created_at DESC LIMIT ${LIST_LIMIT}`,
        [accountId, RankedReportStatus.CONFIRMED.value],
      )
    ).rows.map((row): RankedGameReport => ({
      id: row.id,
      pairId: row.pair_id,
      seasonId: row.season_id,
      format: row.format,
      opponentName: row.opponent_name,
      turn: row.turn,
      description: row.description,
      status: row.status,
      createdAt: Number(row.created_at),
      resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
      ratingChange: row.rating_change,
    }));
    return { seasonId, limit: RANKED_REPORTS_PER_SEASON, used: usage.get(seasonId) ?? 0, reportable, reports };
  }

  async fileReport({ accountId, pairId, description, turn, now = Date.now() }: FileParams): Promise<string> {
    return runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        const game = (
          await db.query<GameRow>(
            `SELECT p.status,p.format,p.season_id,p.result_id,p.voided_at,m.winner_account_id,m.finished_at,s.finalized,
               me.account_id AS participant
             FROM ranked_pairs p
             JOIN match_records m ON m.id=p.result_id
             JOIN ranked_seasons s ON s.id=p.season_id
             LEFT JOIN ranked_pair_players me ON me.pair_id=p.id AND me.account_id=$2
             WHERE p.id=$1`,
            [pairId, accountId],
          )
        ).rows[0];
        if (!game || !game.participant || game.status !== RankedQueueStatus.FINISHED.value) {
          throw new Error("ranked_report_not_found");
        }
        if (!game.winner_account_id || game.winner_account_id === accountId) {
          throw new Error("ranked_report_not_loser");
        }
        if (now > Number(game.finished_at) + RANKED_REPORT_WINDOW_MS) {
          throw new Error("ranked_report_window_closed");
        }
        if (game.voided_at !== null) {
          throw new Error("ranked_report_game_voided");
        }
        if (game.finalized) {
          throw new Error("ranked_report_season_finalized");
        }
        if ((await db.query("SELECT 1 FROM ranked_game_reports WHERE pair_id=$1", [pairId])).rowCount) {
          throw new Error("ranked_report_duplicate");
        }
        const used = Number(
          (
            await db.query<{ used: string }>(
              "SELECT COUNT(*) AS used FROM ranked_game_reports WHERE reporter_account_id=$1 AND season_id=$2",
              [accountId, game.season_id],
            )
          ).rows[0]!.used,
        );
        if (used >= RANKED_REPORTS_PER_SEASON) {
          throw new Error("ranked_report_limit_reached");
        }
        const id = randomUUID();
        await db.query(
          "INSERT INTO ranked_game_reports (id,pair_id,season_id,reporter_account_id,description,turn,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [id, pairId, game.season_id, accountId, description, turn, RankedReportStatus.PENDING.value, now],
        );
        return id;
      },
    });
  }

  async attachReplay({ reportId, capturer }: AttachReplayParams): Promise<boolean> {
    try {
      const matchLogId = (
        await this.accounts.pool.query<{ match_log_id: string | null }>(
          "SELECT p.match_log_id FROM ranked_game_reports r JOIN ranked_pairs p ON p.id=r.pair_id WHERE r.id=$1",
          [reportId],
        )
      ).rows[0]?.match_log_id;
      if (!matchLogId) {
        return false;
      }
      const captured = await capturer.capture(matchLogId);
      if ("failure" in captured || JSON.stringify(captured).length > capturer.maxRecordChars) {
        return false;
      }
      await this.accounts.pool.query(
        "UPDATE ranked_game_reports SET replay=$2,replay_input_count=$3 WHERE id=$1 AND replay IS NULL",
        [reportId, JSON.stringify(captured), captured.inputs.length],
      );
      return true;
    } catch (error) {
      logError("[ranked] report replay capture failed", error);
      return false;
    }
  }

  async listPending(): Promise<RankedAdminReport[]> {
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<
        ReportRow & {
          format: DeckFormat;
          result_id: string;
          finished_at: string;
          reporter_name: string;
          opponent_name: string;
          has_replay: boolean;
        }
      >(
        `SELECT r.id,r.pair_id,r.season_id,r.description,r.turn,r.created_at,p.format,p.result_id,m.finished_at,
           ra.display_name AS reporter_name,oa.display_name AS opponent_name,(r.replay IS NOT NULL) AS has_replay
         FROM ranked_game_reports r
         JOIN ranked_pairs p ON p.id=r.pair_id
         JOIN match_records m ON m.id=p.result_id
         JOIN accounts ra ON ra.id=r.reporter_account_id
         JOIN ranked_pair_players o ON o.pair_id=p.id AND o.account_id<>r.reporter_account_id
         JOIN accounts oa ON oa.id=o.account_id
         WHERE r.status=$1
         ORDER BY r.created_at`,
        [RankedReportStatus.PENDING.value],
      )
    ).rows;
    return rows.map((row) => ({
      id: row.id,
      pairId: row.pair_id,
      matchId: row.result_id,
      seasonId: row.season_id,
      format: row.format,
      reporterName: row.reporter_name,
      opponentName: row.opponent_name,
      turn: row.turn,
      description: row.description,
      createdAt: Number(row.created_at),
      finishedAt: Number(row.finished_at),
      hasReplay: row.has_replay,
    }));
  }

  async getReplay(reportId: string): Promise<ReplayRecord | undefined> {
    await this.accounts.ensureReady();
    const record = (
      await this.accounts.pool.query<{ replay: ReplayRecord | string | null }>(
        "SELECT replay FROM ranked_game_reports WHERE id=$1",
        [reportId],
      )
    ).rows[0]?.replay;
    if (!record) {
      return undefined;
    }
    return typeof record === "string" ? (JSON.parse(record) as ReplayRecord) : record;
  }

  async ruleReport({ reportId, adminAccountId, ruling, now = Date.now() }: RuleParams): Promise<RankedReportStatus> {
    return runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        const report = (
          await db.query<ReportRow>("SELECT * FROM ranked_game_reports WHERE id=$1 FOR UPDATE", [reportId])
        ).rows[0];
        if (!report) {
          throw new Error("ranked_report_not_found");
        }
        if (report.status === ruling) {
          return report.status;
        }
        if (report.status !== RankedReportStatus.PENDING.value) {
          throw new Error("ranked_report_already_resolved");
        }
        const game = (
          await db.query<{ format: DeckFormat; result_id: string; winner_account_id: string | null }>(
            "SELECT p.format,p.result_id,m.winner_account_id FROM ranked_pairs p JOIN match_records m ON m.id=p.result_id WHERE p.id=$1",
            [report.pair_id],
          )
        ).rows[0]!;
        const seats = (
          await db.query<SeatRow>(
            "SELECT p.account_id,a.display_name,p.rating_before,p.rating_after,p.peak_before FROM ranked_pair_players p JOIN accounts a ON a.id=p.account_id WHERE p.pair_id=$1 ORDER BY p.seat",
            [report.pair_id],
          )
        ).rows;
        const voids = ruling === RankedReportStatus.CONFIRMED.value;
        if (voids) {
          const voided = await db.query(
            "UPDATE ranked_pairs SET voided_at=$2 WHERE id=$1 AND voided_at IS NULL RETURNING id",
            [report.pair_id, now],
          );
          if (voided.rowCount) {
            for (const seat of seats) {
              await revertRankedSeat({
                db,
                seat,
                seasonId: report.season_id,
                format: game.format,
                result: getGameResult({ accountId: seat.account_id, winnerAccountId: game.winner_account_id }),
              });
            }
            await db.query("DELETE FROM competitive_match_facts WHERE match_id=$1", [String(game.result_id)]);
          }
        }
        await db.query("UPDATE ranked_game_reports SET status=$2,resolved_at=$3,resolver_account_id=$4 WHERE id=$1", [
          reportId,
          ruling,
          now,
          adminAccountId,
        ]);
        for (const seat of seats) {
          const opponent = seats.find((entry) => entry.account_id !== seat.account_id);
          await notify(db, {
            accountId: seat.account_id,
            kind: "ranked_report_ruling",
            subject: `ranked_report:${reportId}`,
            payload: {
              reportId,
              status: ruling,
              seasonId: report.season_id,
              format: game.format,
              opponentName: opponent?.display_name ?? "",
              reporter: seat.account_id === report.reporter_account_id,
              ratingChange: voids ? -getRatingDelta(seat) : null,
            },
            at: now,
          });
        }
        return ruling;
      },
    });
  }
}

function getRatingDelta(seat: SeatRow): number {
  if (seat.rating_before === null || seat.rating_after === null) {
    return 0;
  }
  return seat.rating_after - seat.rating_before;
}

function getGameResult({ accountId, winnerAccountId }: GameResultParams): GameResult {
  if (!winnerAccountId) {
    return { wins: 0, losses: 0, draws: 1 };
  }
  if (winnerAccountId === accountId) {
    return { wins: 1, losses: 0, draws: 0 };
  }
  return { wins: 0, losses: 1, draws: 0 };
}

async function revertRankedSeat({ db, seat, seasonId, format, result }: RevertParams): Promise<void> {
  const delta = getRatingDelta(seat);
  await db.query("UPDATE ranked_ratings SET rating=GREATEST(0,rating-$3) WHERE account_id=$1 AND format=$2", [
    seat.account_id,
    format,
    delta,
  ]);
  const standing = (
    await db.query<{ rating: number; peak_rating: number | null; games: number }>(
      `UPDATE ranked_standings SET rating=GREATEST(0,rating-$4),wins=GREATEST(0,wins-$5),losses=GREATEST(0,losses-$6),draws=GREATEST(0,draws-$7)
       WHERE season_id=$1 AND account_id=$2 AND format=$3
       RETURNING rating,peak_rating,wins+losses+draws AS games`,
      [seasonId, seat.account_id, format, delta, result.wins, result.losses, result.draws],
    )
  ).rows[0];
  if (standing && standing.peak_rating !== null && standing.peak_rating === seat.rating_after) {
    const peak = standing.games >= 10 ? Math.max(seat.peak_before ?? 0, standing.rating) : null;
    await db.query("UPDATE ranked_standings SET peak_rating=$4 WHERE season_id=$1 AND account_id=$2 AND format=$3", [
      seasonId,
      seat.account_id,
      format,
      peak,
    ]);
  }
  await db.query(
    "UPDATE ranked_standings SET rating=GREATEST(0,rating-$4) WHERE season_id>$1 AND account_id=$2 AND format=$3",
    [seasonId, seat.account_id, format, delta],
  );
}
