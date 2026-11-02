import type { DeckPerformanceRecord } from "@aegis/shared/decks/DeckPerformanceRecord";
import type { MatchHistoryFilter, MatchWinRate } from "@aegis/shared/replays";
import type { Queryable } from "#api/db/migrator";
import { getDeckMatchWinRate } from "#api/accounts/getDeckMatchWinRate";

type Params = {
  db: Queryable;
  accountId: string;
  filter: MatchHistoryFilter;
  decks: Array<{ id: string; name: string }>;
  matchLimit?: number;
};

export async function getDeckPerformanceRecords({
  db,
  accountId,
  filter,
  decks,
  matchLimit,
}: Params): Promise<DeckPerformanceRecord[]> {
  const params: unknown[] = [accountId];
  const conditions = ["account_id=$1", "record->>'opponentKind'='human'", "record->>'mode'<>'bot'"];
  if (filter.mode) {
    conditions.push(`record->>'mode'=$${params.push(filter.mode)}`);
  }
  if (filter.opponent) {
    conditions.push(`record->>'opponentName' ILIKE $${params.push(`%${filter.opponent.replace(/[\\%_]/g, "\\$&")}%`)}`);
  }
  const result = await db.query<MatchWinRate & { deck_id: string }>(
    `SELECT deck_id,count(*)::int matches,
    SUM(CASE WHEN record->>'result'='win' THEN 1 ELSE 0 END)::int wins,
    SUM(CASE WHEN record->>'result'='loss' THEN 1 ELSE 0 END)::int losses,
    SUM(CASE WHEN record->>'result'='draw' THEN 1 ELSE 0 END)::int draws
    FROM account_deck_matches WHERE ${conditions.join(" AND ")} GROUP BY deck_id ORDER BY matches DESC,deck_id`,
    params,
  );
  const records = await Promise.all(
    result.rows.map(async ({ deck_id, matches, wins, losses, draws }) => ({
      deckId: deck_id,
      name: decks.find((deck) => deck.id === deck_id)?.name ?? deck_id,
      stats:
        matchLimit === undefined
          ? { matches, wins, losses, draws }
          : await getDeckMatchWinRate({ db, accountId, filter: { ...filter, deckId: deck_id }, matchLimit }),
    })),
  );
  return records;
}
