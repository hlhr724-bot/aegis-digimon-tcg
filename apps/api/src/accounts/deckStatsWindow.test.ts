import { afterEach, expect, it } from "vitest";
import { DeckStatsWindow } from "@aegis/shared/decks/DeckStatsWindow";
import { AccountStore } from "#api/accounts/AccountStore";
import { buildDeckCompositionKey } from "#api/accounts/buildDeckCompositionKey";
import { buildDeckCompositionSignature } from "#api/accounts/buildDeckCompositionSignature";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

let store: AccountStore;
afterEach(async () => {
  await store?.close();
});

async function seedDeckMatches(accountId: string, deckId: string, results: Array<"win" | "loss">, signature: string) {
  const playedFrom = Date.now() + 1_000;
  const params: unknown[] = [];
  const rows = results.map((result, index) => {
    const start =
      params.push(
        accountId,
        `${deckId}-${index}`,
        deckId,
        deckId,
        JSON.stringify({
          mode: "casual",
          opponentKind: "human",
          opponentName: "Rival",
          result,
          finishedAt: playedFrom + index,
          ownDeckSignature: signature,
          ownDeckStartedAt: playedFrom + index,
        }),
      ) - 4;
    return `($${start},$${start + 1},$${start + 2},$${start + 3},$${start + 4})`;
  });
  await store.pool.query(
    `INSERT INTO account_deck_matches (account_id,room_id,deck_id,deck_name,record) VALUES ${rows.join(",")}`,
    params,
  );
}

it("limits deck totals and the deck comparison to each deck's last 100 matches", async () => {
  store = new AccountStore(createMemoryPool());
  const account = await store.accountForIdentity("discord", "owner", "Owner");
  const deck = await store.saveDeck(account.id, { id: "blue", name: "Blue", mainDeck: ["BT1-001"], eggDeck: [] });
  const signature = buildDeckCompositionSignature({ compositionKey: buildDeckCompositionKey(deck) });
  const olderLosses = Array.from({ length: 5 }, () => "loss" as const);
  const newerWins = Array.from({ length: 100 }, () => "win" as const);
  await seedDeckMatches(account.id, deck.id, [...olderLosses, ...newerWins], signature);
  await seedDeckMatches(account.id, "red", ["loss", "win"], "other");

  const page = (deckWindow: DeckStatsWindow, deckId?: string) =>
    store.matchHistory(account.id, { page: 1, limit: 25, deckWindow, ...(deckId ? { deckId } : {}) });

  const lastHundred = await page(DeckStatsWindow.LAST_100.value, deck.id);
  expect(lastHundred.deckStats?.total).toEqual({ matches: 100, wins: 100, losses: 0, draws: 0 });
  expect(lastHundred.deckStats?.sinceChange).toEqual({ matches: 105, wins: 100, losses: 5, draws: 0 });
  expect((await page(DeckStatsWindow.ALL.value, deck.id)).deckStats?.total).toEqual({
    matches: 105,
    wins: 100,
    losses: 5,
    draws: 0,
  });

  expect((await page(DeckStatsWindow.LAST_100.value)).deckRecords?.map(({ deckId, stats }) => [deckId, stats])).toEqual(
    [
      ["blue", { matches: 100, wins: 100, losses: 0, draws: 0 }],
      ["red", { matches: 2, wins: 1, losses: 1, draws: 0 }],
    ],
  );
  expect((await page(DeckStatsWindow.ALL.value)).deckRecords?.[0]?.stats).toEqual({
    matches: 105,
    wins: 100,
    losses: 5,
    draws: 0,
  });
});
