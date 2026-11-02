import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountStore, type StoredMatchRecord } from "#api/accounts/AccountStore";
import { buildDeckCompositionKey } from "#api/accounts/buildDeckCompositionKey";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";

afterEach(() => vi.restoreAllMocks());

describe("deck match history", () => {
  it("tracks the selected deck across card changes without resetting for names, order or artwork", async () => {
    const adapter = createMemoryDatabase().adapters.createPg();
    const store = new AccountStore(new adapter.Pool() as never);
    const account = await store.accountForIdentity("discord", "owner", "Deck Owner");
    const other = await store.accountForIdentity("discord", "other", "Other Owner");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    let deck = await store.saveDeck(account.id, {
      id: "blue",
      name: "Blue",
      mainDeck: ["BT1-001", "BT1-002"],
      eggDeck: [],
    });
    async function record(id: string, changes: Partial<StoredMatchRecord> = {}) {
      await store.recordRecentMatch(account.id, id, {
        id,
        mode: "casual",
        opponentKind: "human",
        opponentName: "Rival",
        result: "win",
        reason: "security",
        finishedAt: Date.now(),
        ownDeckId: deck.id,
        ownDeckName: deck.name,
        ownDeckKey: buildDeckCompositionKey(deck),
        ownDeckStartedAt: Date.now(),
        ...changes,
      });
    }
    clock.mockReturnValue(2000);
    await record("first");
    clock.mockReturnValue(3000);
    deck = await store.saveDeck(account.id, {
      ...deck,
      name: "Renamed",
      mainDeck: [...deck.mainDeck].reverse(),
      coverCardId: "BT1-001",
    });
    let history = await store.matchHistory(account.id, { page: 1, limit: 25, deckId: deck.id });
    expect(history.deckStats).toEqual({
      total: { matches: 1, wins: 1, losses: 0, draws: 0 },
      sinceChange: { matches: 1, wins: 1, losses: 0, draws: 0 },
    });
    expect(history.decks).toContainEqual({ id: "blue", name: "Renamed" });
    expect(history.deckDetails?.deck).toMatchObject({
      deckId: "blue",
      deckName: "Renamed",
      mainDeck: ["BT1-002", "BT1-001"],
    });
    expect(history.deckDetails?.cardsChangedAt).toBe(1000);
    expect(history.matches[0]?.deckName).toBe("Blue");
    expect(history.matches[0]).not.toHaveProperty("ownDeckKey");
    expect(history.matches[0]).not.toHaveProperty("ownDeckId");
    clock.mockReturnValue(4000);
    deck = await store.saveDeck(account.id, { ...deck, mainDeck: ["BT1-003"] });
    history = await store.matchHistory(account.id, { page: 1, limit: 25, deckId: deck.id });
    expect(history.deckStats?.sinceChange?.matches).toBe(0);
    clock.mockReturnValue(5000);
    await record("current-loss", { result: "loss" });
    await record("current-draw", { result: "draw", mode: "ranked" });
    await record("bot", { opponentKind: "bot", mode: "bot" });
    await record("other-deck", { ownDeckId: "red" });
    await record("legacy", { ownDeckId: undefined, ownDeckKey: undefined });
    await record("already-started", { ownDeckStartedAt: 3500 });
    history = await store.matchHistory(account.id, { page: 1, limit: 1, deckId: deck.id, result: "win" });
    expect(history.matches).toHaveLength(1);
    expect(history.recentDeckResults).toHaveLength(4);
    expect(history.recentDeckResults).toEqual(expect.arrayContaining(["loss", "draw"]));
    expect(history.deckStats).toEqual({
      total: { matches: 4, wins: 2, losses: 1, draws: 1 },
      sinceChange: { matches: 2, wins: 0, losses: 1, draws: 1 },
    });
    expect(
      (await store.matchHistory(account.id, { page: 1, limit: 25, deckId: deck.id, mode: "ranked" })).deckStats
        ?.sinceChange,
    ).toEqual({ matches: 1, wins: 0, losses: 0, draws: 1 });
    expect(
      (await store.matchHistory(account.id, { page: 1, limit: 25, deckId: deck.id, opponent: "nobody" })).deckStats
        ?.total.matches,
    ).toBe(0);
    expect((await store.matchHistory(other.id, { page: 1, limit: 25, deckId: deck.id })).deckStats).toEqual({
      total: { matches: 0, wins: 0, losses: 0, draws: 0 },
      sinceChange: null,
    });
    await store.deleteDeck(account.id, deck.id);
    const deletedHistory = await store.matchHistory(account.id, { page: 1, limit: 25, deckId: deck.id });
    expect(deletedHistory.deckStats?.sinceChange).toBeNull();
    expect(deletedHistory.deckDetails).toBeUndefined();
    expect(deletedHistory.decks).toContainEqual({ id: "blue", name: "Renamed" });
    await store.close();
  });
});

it("keeps deck totals after recent history is pruned and records duplicate reports once", async () => {
  const adapter = createMemoryDatabase().adapters.createPg();
  const store = new AccountStore(new adapter.Pool() as never);
  const account = await store.accountForIdentity("discord", "durable", "Durable Owner");
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  const deck = await store.saveDeck(account.id, { id: "blue", name: "Blue", mainDeck: ["BT1-001"], eggDeck: [] });
  const record: StoredMatchRecord = {
    id: "original",
    mode: "casual",
    opponentKind: "human",
    opponentName: "Rival",
    result: "win",
    reason: "security",
    finishedAt: 2000,
    ownDeckId: deck.id,
    ownDeckName: deck.name,
    ownDeckKey: buildDeckCompositionKey(deck),
    ownDeckStartedAt: 1500,
  };
  await store.recordRecentMatch(account.id, "original", record);
  await store.recordRecentMatch(account.id, "original", record);
  for (let index = 0; index < 101; index++) {
    clock.mockReturnValue(3000 + index);
    await store.recordRecentMatch(account.id, `unrelated-${index}`, {
      ...record,
      id: `unrelated-${index}`,
      finishedAt: Date.now(),
      ownDeckId: "red",
    });
  }
  const history = await store.matchHistory(account.id, { page: 1, limit: 25, deckId: deck.id });
  expect(history.total).toBe(0);
  expect(history.deckStats).toEqual({
    total: { matches: 1, wins: 1, losses: 0, draws: 0 },
    sinceChange: { matches: 1, wins: 1, losses: 0, draws: 0 },
  });
  await store.close();
});

it("enriches a competitive placeholder once and does not double count the room result", async () => {
  const adapter = createMemoryDatabase().adapters.createPg();
  const store = new AccountStore(new adapter.Pool() as never);
  const owner = await store.accountForIdentity("discord", "ranked-owner", "Ranked Owner");
  const opponent = await store.accountForIdentity("discord", "ranked-opponent", "Ranked Opponent");
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const deck = await store.saveDeck(owner.id, { id: "blue", name: "Blue", mainDeck: ["BT1-001"], eggDeck: [] });
  await store.recordMatch({
    roomId: "ranked-room",
    mode: "ranked",
    playerAccountIds: [owner.id, opponent.id],
    winnerAccountId: owner.id,
    reason: "security",
    deckSnapshots: [
      { deckId: deck.id, deckName: deck.name, mainDeck: deck.mainDeck, eggDeck: [] },
      { deckId: "red", deckName: "Red", mainDeck: ["BT1-002"], eggDeck: [] },
    ],
  });
  await store.recordRecentMatch(owner.id, "ranked-room", {
    id: "replay-id",
    mode: "ranked",
    opponentKind: "human",
    opponentName: opponent.displayName,
    result: "win",
    reason: "security",
    finishedAt: 3000,
    ownDeckId: deck.id,
    ownDeckName: deck.name,
    ownDeckKey: buildDeckCompositionKey(deck),
    ownDeckStartedAt: 2000,
  });
  const history = await store.matchHistory(owner.id, { page: 1, limit: 25, deckId: deck.id });
  expect(history.total).toBe(1);
  expect(history.deckStats?.total.matches).toBe(1);
  expect(history.deckStats?.sinceChange?.matches).toBe(1);
  await store.close();
});

it("compares only the account's deck records and scopes them by mode and opponent", async () => {
  const adapter = createMemoryDatabase().adapters.createPg();
  const store = new AccountStore(new adapter.Pool() as never);
  const owner = await store.accountForIdentity("discord", "deck-record-owner", "Record Owner");
  const other = await store.accountForIdentity("discord", "deck-record-other", "Other Owner");
  const deck = await store.saveDeck(owner.id, { id: "blue", name: "My Blue", mainDeck: ["BT1-010"], eggDeck: [] });
  for (const [accountId, roomId, deckId, result, mode] of [
    [owner.id, "blue-win", "blue", "win", "ranked"],
    [owner.id, "fun-loss", "fun-deck", "loss", "casual"],
    [other.id, "other-blue", "blue", "win", "ranked"],
  ] as const) {
    await store.recordRecentMatch(accountId, roomId, {
      id: roomId,
      mode,
      opponentName: "Rival",
      opponentKind: "human",
      result,
      reason: "security",
      finishedAt: Date.now(),
      ownDeckId: deckId,
      ownDeckName: deckId === "blue" ? deck.name : "Fun deck",
      ownDeckKey: buildDeckCompositionKey(deck),
      ownDeckStartedAt: Date.now(),
    });
  }
  const all = await store.matchHistory(owner.id, { page: 1, limit: 25, result: "loss" });
  expect(all.deckRecords).toEqual(
    expect.arrayContaining([
      { deckId: "blue", name: "My Blue", stats: { matches: 1, wins: 1, losses: 0, draws: 0 } },
      { deckId: "fun-deck", name: "Fun deck", stats: { matches: 1, wins: 0, losses: 1, draws: 0 } },
    ]),
  );
  expect(all).not.toHaveProperty("deckMatchups");
  const ranked = await store.matchHistory(owner.id, { page: 1, limit: 25, mode: "ranked" });
  expect(ranked.deckRecords).toHaveLength(1);
  expect(ranked.deckRecords?.[0]?.deckId).toBe("blue");
  expect((await store.matchHistory(owner.id, { page: 1, limit: 25, opponent: "absent-rival" })).deckRecords).toEqual(
    [],
  );
  expect(await store.matchHistory(owner.id, { page: 1, limit: 25, deckId: "blue" })).not.toHaveProperty("deckMatchups");
  await store.close();
});
