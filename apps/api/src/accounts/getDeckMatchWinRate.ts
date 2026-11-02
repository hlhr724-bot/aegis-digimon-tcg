import type { MatchHistoryFilter, MatchWinRate } from "@aegis/shared/replays";
import type { Queryable } from "#api/db/migrator";

type Params = {
  db: Queryable;
  accountId: string;
  filter: MatchHistoryFilter;
  compositionSignature?: string;
  changedAt?: number;
  matchLimit?: number;
};

export async function getDeckMatchWinRate({
  db,
  accountId,
  filter,
  compositionSignature,
  changedAt,
  matchLimit,
}: Params): Promise<MatchWinRate> {
  const params: unknown[] = [accountId, filter.deckId];
  const conditions = ["account_id=$1", "deck_id=$2", "record->>'opponentKind'='human'", "record->>'mode'<>'bot'"];
  if (filter.mode) {
    conditions.push(`record->>'mode'=$${params.push(filter.mode)}`);
  }
  if (filter.opponent) {
    conditions.push(`record->>'opponentName' ILIKE $${params.push(`%${filter.opponent.replace(/[\\%_]/g, "\\$&")}%`)}`);
  }
  if (compositionSignature !== undefined) {
    conditions.push(`record->>'ownDeckSignature'=$${params.push(compositionSignature)}`);
    conditions.push(`(record->>'ownDeckStartedAt')::bigint >= $${params.push(changedAt ?? 0)}`);
  }
  const matching = `account_deck_matches WHERE ${conditions.join(" AND ")}`;
  const source =
    matchLimit === undefined
      ? matching
      : `(SELECT record FROM ${matching}
        ORDER BY COALESCE((record->>'finishedAt')::bigint,(record->>'ownDeckStartedAt')::bigint,0) DESC, room_id DESC
        LIMIT $${params.push(matchLimit)}) recent`;
  const result = await db.query<MatchWinRate>(
    `SELECT count(*)::int matches,
    COALESCE(SUM(CASE WHEN record->>'result'='win' THEN 1 ELSE 0 END),0)::int wins,
    COALESCE(SUM(CASE WHEN record->>'result'='loss' THEN 1 ELSE 0 END),0)::int losses,
    COALESCE(SUM(CASE WHEN record->>'result'='draw' THEN 1 ELSE 0 END),0)::int draws
    FROM ${source}`,
    params,
  );
  const rate = result.rows[0];
  return {
    matches: Number(rate?.matches ?? 0),
    wins: Number(rate?.wins ?? 0),
    losses: Number(rate?.losses ?? 0),
    draws: Number(rate?.draws ?? 0),
  };
}
