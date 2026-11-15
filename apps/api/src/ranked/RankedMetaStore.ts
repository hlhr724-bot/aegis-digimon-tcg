import type { AccountStore } from "#api/accounts/AccountStore";
import type { RankedDeckStats } from "@aegis/shared/ranked/RankedDeckStats";

type Params = { format: string; region?: string; seasonId: number };
type Row = {
  archetype: string;
  games: string;
  wins: string;
  players: string;
  cover_card_id: string | null;
  primary_color: string | null;
  secondary_color: string | null;
};

export class RankedMetaStore {
  constructor(private readonly accounts: AccountStore) {}

  async getDeckStats({ format, region, seasonId }: Params): Promise<RankedDeckStats[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<Row>(
      `SELECT f.archetype,COUNT(*) AS games,COUNT(DISTINCT f.account_id) AS players,
       SUM(CASE WHEN f.result='win' THEN 1 ELSE 0 END) AS wins,
       a.cover_card_id,a.primary_color,a.secondary_color
       FROM competitive_match_facts f JOIN ranked_pairs p ON p.result_id::text=f.match_id
       LEFT JOIN competitive_archetypes a ON a.archetype=f.archetype
       WHERE f.origin='ranked' AND f.format=$1
       AND ($2::text IS NULL OR f.region=$2) AND p.season_id=$3
       GROUP BY f.archetype,a.cover_card_id,a.primary_color,a.secondary_color ORDER BY wins DESC,f.archetype`,
      [format, region ?? null, seasonId],
    );
    return rows.map((row) => {
      const games = Number(row.games);
      const wins = Number(row.wins);
      const players = Number(row.players);
      return {
        archetype: row.archetype,
        games,
        wins,
        players,
        winrate: games >= 30 && players >= 10 && row.archetype !== "unknown" ? wins / games : null,
        coverCardId: row.cover_card_id,
        colors: [row.primary_color, row.secondary_color].filter((color): color is string => color !== null),
      };
    });
  }
}
