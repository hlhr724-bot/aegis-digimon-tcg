import { describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { countRankedSearchers } from "#api/ranked/countRankedSearchers";

type QueueRow = {
  accountId: string;
  format: string;
  slot?: string;
  heartbeatAt?: number;
  pairId?: string;
};

const NOW = 1_000_000;

async function enqueue(
  accounts: AccountStore,
  { accountId, format, slot = "blue", heartbeatAt = NOW, pairId }: QueueRow,
) {
  await accounts.pool.query(
    "INSERT INTO ranked_queue (account_id,search_id,format,region,slot,rating,deck,banlist,queued_at,heartbeat_at,pair_id,token) VALUES ($1,$2,$3,'europe',$4,1000,'{}','[]',$5,$5,$6,'token')",
    [accountId, crypto.randomUUID(), format, slot, heartbeatAt, pairId ?? null],
  );
}

describe("ranked searcher count", () => {
  it("counts unpaired players with a live heartbeat on this slot, per format", async () => {
    const accounts = new AccountStore(createMemoryPool());
    const ids = await Promise.all(
      ["a", "b", "c", "d", "e", "f"].map(
        async (name) => (await accounts.accountForIdentity("discord", `ranked-count-${name}`, name)).id,
      ),
    );
    const pairId = crypto.randomUUID();
    await accounts.pool.query(
      "INSERT INTO ranked_pairs (id,format,slot,status,created_at,reservation_expires_at,heartbeat_at) VALUES ($1,'standard','blue','reserved',$2,$2,$2)",
      [pairId, NOW],
    );
    await enqueue(accounts, { accountId: ids[0]!, format: "standard" });
    await enqueue(accounts, { accountId: ids[1]!, format: "standard", heartbeatAt: NOW - 30_000 });
    await enqueue(accounts, { accountId: ids[2]!, format: "pauper" });
    await enqueue(accounts, { accountId: ids[3]!, format: "standard", heartbeatAt: NOW - 30_001 });
    await enqueue(accounts, { accountId: ids[4]!, format: "standard", slot: "red" });
    await enqueue(accounts, { accountId: ids[5]!, format: "standard", pairId });

    const counts = await countRankedSearchers({ accounts, slot: "blue", now: NOW });

    expect(counts.sort((first, second) => first.format.localeCompare(second.format))).toEqual([
      { format: "pauper", searching: 1 },
      { format: "standard", searching: 2 },
    ]);
    await accounts.close();
  });
});
