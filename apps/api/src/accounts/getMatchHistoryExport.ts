import type { MatchHistoryExportRecord } from "@aegis/shared/replays/MatchHistoryExport";
import type { StoredMatchRecord } from "#api/accounts/AccountStore";
import type { Queryable } from "#api/db/migrator";

type Params = { db: Queryable; accountId: string };

export async function getMatchHistoryExport({ db, accountId }: Params): Promise<MatchHistoryExportRecord[]> {
  const result = await db.query<{ record: StoredMatchRecord }>(
    "SELECT record FROM account_recent_matches WHERE account_id=$1 ORDER BY finished_at DESC, room_id DESC",
    [accountId],
  );
  return result.rows.map(({ record }) => ({
    id: record.id,
    mode: record.mode,
    opponentName: record.opponentName,
    opponentKind: record.opponentKind,
    result: record.result,
    reason: record.reason,
    finishedAt: record.finishedAt,
    ...(record.ownDeckName ? { deckName: record.ownDeckName } : {}),
  }));
}
