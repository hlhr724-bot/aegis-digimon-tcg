import type { AccountStore } from "#api/accounts/AccountStore";
import type { DeckFormat } from "@aegis/shared/deckFormat";

export type RankedSearcherCount = {
  format: DeckFormat;
  searching: number;
};

type Params = {
  accounts: Pick<AccountStore, "ensureReady" | "pool">;
  slot: string;
  now?: number;
};

const RANKED_QUEUE_HEARTBEAT_TIMEOUT_MS = 30_000;

export async function countRankedSearchers({
  accounts,
  slot,
  now = Date.now(),
}: Params): Promise<RankedSearcherCount[]> {
  await accounts.ensureReady();
  const { rows } = await accounts.pool.query<{ format: DeckFormat; searching: string | number }>(
    "SELECT format, COUNT(*) AS searching FROM ranked_queue WHERE pair_id IS NULL AND slot=$1 AND heartbeat_at>=$2 GROUP BY format",
    [slot, now - RANKED_QUEUE_HEARTBEAT_TIMEOUT_MS],
  );
  return rows.map((row) => ({ format: row.format, searching: Number(row.searching) }));
}
