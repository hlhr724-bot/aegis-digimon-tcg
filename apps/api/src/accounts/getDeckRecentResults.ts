import type { MatchHistoryFilter, MatchHistoryRecord } from "@aegis/shared/replays";
import type { Queryable } from "#api/db/migrator";

type Params = { db: Queryable; accountId: string; filter: MatchHistoryFilter };

export async function getDeckRecentResults({
  db,
  accountId,
  filter,
}: Params): Promise<Array<MatchHistoryRecord["result"]>> {
  const params: unknown[] = [accountId, filter.deckId];
  const conditions = ["account_id=$1", "deck_id=$2", "record->>'opponentKind'='human'", "record->>'mode'<>'bot'"];
  if (filter.mode) {
    conditions.push(`record->>'mode'=$${params.push(filter.mode)}`);
  }
  if (filter.opponent) {
    conditions.push(`record->>'opponentName' ILIKE $${params.push(`%${filter.opponent.replace(/[\\%_]/g, "\\$&")}%`)}`);
  }
  const result = await db.query<{ result: MatchHistoryRecord["result"] }>(
    `SELECT record->>'result' result FROM account_deck_matches WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE((record->>'finishedAt')::bigint,(record->>'ownDeckStartedAt')::bigint,0) DESC, room_id DESC LIMIT 8`,
    params,
  );
  return result.rows.map((row) => row.result);
}
