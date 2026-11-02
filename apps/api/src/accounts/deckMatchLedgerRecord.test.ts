import { afterEach, expect, it } from "vitest";
import { AccountStore, type StoredMatchRecord } from "#api/accounts/AccountStore";
import { buildDeckCompositionKey } from "#api/accounts/buildDeckCompositionKey";
import { buildDeckCompositionSignature } from "#api/accounts/buildDeckCompositionSignature";
import { slimDeckMatchLedger } from "#api/db/migrations/049-slim-deck-match-ledger";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

let store: AccountStore;
afterEach(async () => {
  await store?.close();
});

const deck = { mainDeck: ["BT1-001", "BT1-002"], eggDeck: ["BT1-003"] };
const compositionKey = buildDeckCompositionKey(deck);

async function ledgerRecord(accountId: string): Promise<Record<string, unknown> | undefined> {
  const { rows } = await store.pool.query<{ record: Record<string, unknown> }>(
    "SELECT record FROM account_deck_matches WHERE account_id=$1",
    [accountId],
  );
  return rows[0]?.record;
}

it("stores the deck composition signature in the ledger instead of the full card list", async () => {
  store = new AccountStore(createMemoryPool());
  const account = await store.accountForIdentity("discord", "owner", "Owner");
  const record: StoredMatchRecord = {
    id: "match-1",
    mode: "casual",
    opponentKind: "human",
    opponentName: "Rival",
    result: "win",
    reason: "security",
    finishedAt: 2000,
    ownDeckId: "blue",
    ownDeckName: "Blue",
    ownDeckKey: compositionKey,
    ownDeckStartedAt: 1500,
  };
  await store.recordRecentMatch(account.id, "room-1", record);

  const stored = await ledgerRecord(account.id);
  expect(stored).not.toHaveProperty("ownDeckKey");
  expect(stored?.ownDeckSignature).toBe(buildDeckCompositionSignature({ compositionKey }));
});

it("removes the full card list from ledger rows written before the slimmer record", async () => {
  store = new AccountStore(createMemoryPool());
  const account = await store.accountForIdentity("discord", "owner", "Owner");
  const signature = buildDeckCompositionSignature({ compositionKey });
  await store.pool.query(
    "INSERT INTO account_deck_matches (account_id,room_id,deck_id,deck_name,record) VALUES ($1,$2,$3,$4,$5)",
    [
      account.id,
      "room-1",
      "blue",
      "Blue",
      JSON.stringify({ result: "win", ownDeckKey: compositionKey, ownDeckSignature: signature }),
    ],
  );

  await slimDeckMatchLedger.up(store.pool);

  expect(await ledgerRecord(account.id)).toEqual({ result: "win", ownDeckSignature: signature });
});
