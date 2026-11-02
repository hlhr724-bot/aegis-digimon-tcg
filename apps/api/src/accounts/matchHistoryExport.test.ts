import { afterEach, expect, it } from "vitest";
import { AccountStore, type StoredMatchRecord } from "#api/accounts/AccountStore";
import { getMatchHistoryExport } from "#api/accounts/getMatchHistoryExport";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

let store: AccountStore;
afterEach(async () => {
  await store?.close();
});

const record = (id: string, finishedAt: number, changes: Partial<StoredMatchRecord> = {}): StoredMatchRecord => ({
  id,
  mode: "ranked",
  opponentKind: "human",
  opponentName: "Rival",
  result: "win",
  reason: "security",
  finishedAt,
  ...changes,
});

it("exports the whole retained history newest first without private fields", async () => {
  store = new AccountStore(createMemoryPool());
  const owner = await store.accountForIdentity("discord", "owner", "Owner");
  const other = await store.accountForIdentity("discord", "other", "Other");
  await store.recordRecentMatch(owner.id, "room-old", record("old", 1000));
  await store.recordRecentMatch(
    owner.id,
    "room-new",
    record("new", 2000, {
      ownDeckId: "blue",
      ownDeckName: "Blue Flare",
      ownDeckKey: "private-key",
      opponentAccountId: other.id,
      opponentDeckOwnerAccountId: other.id,
    }),
  );
  await store.recordRecentMatch(other.id, "room-other", record("other", 3000));

  expect(await getMatchHistoryExport({ db: store.pool, accountId: owner.id })).toEqual([
    { ...record("new", 2000), deckName: "Blue Flare" },
    record("old", 1000),
  ]);
});
