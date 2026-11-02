import { getRankedSeasonFormats } from "#api/ranked/getRankedSeasonFormats";
import { RankedDiscordStatus } from "@aegis/shared/ranked/RankedDiscordStatus";
import type { AccountStore } from "#api/accounts/AccountStore";
import type {
  RankedLeaderboard,
  RankedSeason,
  RankedStanding,
  RankedMatchup,
} from "@aegis/shared/ranked/RankedContracts";
import type { RankedRegion } from "@aegis/shared/ranked/RankedRegion";
import { getRankedTier } from "@aegis/shared/ranked/getRankedTier";
import { getRankedSeason } from "#api/ranked/getRankedSeason";
import { runRankedTransaction } from "#api/ranked/runRankedTransaction";
import { RankedQueueStatus } from "@aegis/shared/ranked/RankedQueueStatus";
import { RankedReportStatus } from "@aegis/shared/ranked/RankedReportStatus";

type LeaderboardParams = { seasonId?: number; format: string; region?: string; page: number; accountId?: string };
type MatchupParams = { origin: string; format: string; region?: string; from: number; until: number; page: number };
type StandingRow = {
  account_id: string;
  display_name: string;
  rating: number;
  peak_rating: number | null;
  region: RankedRegion;
  wins: number;
  losses: number;
  draws: number;
  position: string | null;
};

export class RankedSeasonStore {
  constructor(private readonly accounts: AccountStore) {}

  async getSeasons(now = Date.now()): Promise<RankedSeason[]> {
    await this.accounts.ensureReady();
    const current = getRankedSeason(now);
    await this.accounts.pool.query(
      "INSERT INTO ranked_seasons (id,starts_at,ends_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [current.id, current.startsAt, current.endsAt],
    );
    const result = await this.accounts.pool.query<{
      id: number;
      starts_at: string;
      ends_at: string;
      finalized: boolean;
    }>("SELECT * FROM ranked_seasons ORDER BY id DESC");
    return result.rows.map((row) => ({
      id: row.id,
      startsAt: Number(row.starts_at),
      endsAt: Number(row.ends_at),
      finalized: row.finalized,
      formats: getRankedSeasonFormats({ seasonId: row.id }),
    }));
  }

  async getLeaderboard({ seasonId, format, region, page, accountId }: LeaderboardParams): Promise<RankedLeaderboard> {
    const seasons = await this.getSeasons();
    const season = seasons.find((entry) => entry.id === (seasonId ?? seasons[0]!.id));
    if (!season) {
      throw new Error("ranked_season_not_found");
    }
    const query = `WITH ranked AS (SELECT s.*,a.display_name,CASE WHEN wins+losses+draws>=10 THEN RANK() OVER (PARTITION BY (wins+losses+draws>=10) ORDER BY rating DESC) ELSE NULL END AS position FROM ranked_standings s JOIN accounts a ON a.id=s.account_id WHERE season_id=$1 AND format=$2 AND ($3::text IS NULL OR region=$3))`;
    const params = [season.id, format, region ?? null];
    const entries = (
      await this.accounts.pool.query<StandingRow>(
        `${query} SELECT * FROM ranked ORDER BY (position IS NULL),rating DESC,account_id LIMIT 50 OFFSET $4`,
        [...params, (page - 1) * 50],
      )
    ).rows;
    const mine = accountId
      ? (
          await this.accounts.pool.query<StandingRow>(`${query} SELECT * FROM ranked WHERE account_id=$4`, [
            ...params,
            accountId,
          ])
        ).rows[0]
      : undefined;
    const total = Number(
      (
        await this.accounts.pool.query<{ total: string }>(
          "SELECT COUNT(*) AS total FROM ranked_standings WHERE season_id=$1 AND format=$2 AND ($3::text IS NULL OR region=$3)",
          params,
        )
      ).rows[0]!.total,
    );
    return { season, entries: entries.map(buildStanding), mine: mine ? buildStanding(mine) : null, page, total };
  }

  async finalizeSeasons(now = Date.now()): Promise<void> {
    await runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        const seasons = (
          await db.query<{ id: number }>(
            "SELECT id FROM ranked_seasons WHERE ends_at<=$1 AND finalized=false ORDER BY id",
            [now],
          )
        ).rows;
        for (const season of seasons) {
          const active = await db.query("SELECT id FROM ranked_pairs WHERE season_id=$1 AND status=$2", [
            season.id,
            RankedQueueStatus.PLAYING.value,
          ]);
          const pendingReports = await db.query(
            "SELECT id FROM ranked_game_reports WHERE season_id=$1 AND status=$2 LIMIT 1",
            [season.id, RankedReportStatus.PENDING.value],
          );
          if (active.rowCount || pendingReports.rowCount) {
            continue;
          }
          await db.query(
            `UPDATE ranked_discord SET desired_tier=NULL,status='${RankedDiscordStatus.PENDING.value}',attempts=0,retry_at=0 WHERE opted_in=true`,
          );
          const standings = (
            await db.query<{ account_id: string; peak: number }>(
              "SELECT account_id,MAX(peak_rating) AS peak FROM ranked_standings WHERE season_id=$1 AND peak_rating IS NOT NULL GROUP BY account_id",
              [season.id],
            )
          ).rows;
          for (const standing of standings) {
            const tier = getRankedTier(standing.peak);
            await db.query(
              "INSERT INTO ranked_rewards (season_id,account_id,tier,granted_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
              [season.id, standing.account_id, tier, now],
            );
            await db.query(
              `UPDATE ranked_discord SET desired_tier=$2,status='${RankedDiscordStatus.PENDING.value}',attempts=0,retry_at=0 WHERE account_id=$1 AND opted_in=true`,
              [standing.account_id, tier],
            );
          }
          await db.query("UPDATE ranked_seasons SET finalized=true WHERE id=$1", [season.id]);
        }
      },
    });
  }

  async getMatchups({ origin, format, region, from, until, page }: MatchupParams): Promise<RankedMatchup[]> {
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<{
        archetype: string;
        opponent_archetype: string;
        games: string;
        players: string;
        wins: string;
        losses: string;
        draws: string;
        samples: string;
      }>(
        `
      WITH filtered AS (
        SELECT * FROM competitive_match_facts WHERE origin=$1 AND format=$2 AND ($3::text IS NULL OR region=$3) AND finished_at>=$4 AND finished_at<$5
      ), outcomes AS (
        SELECT archetype,opponent_archetype,COUNT(DISTINCT match_id) AS games,COUNT(*) AS samples,
          SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) AS losses,
          SUM(CASE WHEN result='draw' THEN 1 ELSE 0 END) AS draws
        FROM filtered GROUP BY archetype,opponent_archetype
      ), participants AS (
        SELECT archetype,opponent_archetype,account_id FROM filtered
        UNION SELECT archetype,opponent_archetype,opponent_account_id AS account_id FROM filtered
      )
      SELECT o.*,(SELECT COUNT(*) FROM participants p WHERE p.archetype=o.archetype AND p.opponent_archetype=o.opponent_archetype) AS players
      FROM outcomes o ORDER BY games DESC,archetype,opponent_archetype LIMIT 50 OFFSET $6
    `,
        [origin, format, region ?? null, from, until, (page - 1) * 50],
      )
    ).rows;
    return rows.map((row) => {
      const games = Number(row.games);
      const players = Number(row.players);
      const wins = Number(row.wins);
      return {
        archetype: row.archetype,
        opponentArchetype: row.opponent_archetype,
        games,
        players,
        wins,
        losses: Number(row.losses),
        draws: Number(row.draws),
        winrate:
          games >= 30 && players >= 10 && row.archetype !== "unknown" && row.opponent_archetype !== "unknown"
            ? wins / Number(row.samples)
            : null,
      };
    });
  }
}

function buildStanding(row: StandingRow): RankedStanding {
  const games = row.wins + row.losses + row.draws;
  return {
    accountId: row.account_id,
    displayName: row.display_name,
    position: row.position === null ? null : Number(row.position),
    rating: row.rating,
    peakRating: row.peak_rating,
    tier: getRankedTier(row.rating),
    region: row.region,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    games,
    winrate: games ? row.wins / games : null,
    provisional: games < 10,
  };
}
