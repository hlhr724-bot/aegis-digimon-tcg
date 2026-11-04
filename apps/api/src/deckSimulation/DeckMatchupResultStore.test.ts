import { describe, expect, it } from "vitest";
import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { DeckMatchupResultStore } from "#api/deckSimulation/DeckMatchupResultStore";

function job(score: number): MatchupJob {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    status: "completed",
    requestedGames: 4,
    completedGames: 4,
    wins: score * 4,
    losses: 4 - score * 4,
    draws: 0,
    invalidGames: 0,
    score,
    interval: [0.1, 0.9],
    opponents: [],
    samples: [],
    createdAt: "2026-11-03T00:00:00.000Z",
    expiresAt: "2026-11-03T00:15:00.000Z",
  };
}

describe("DeckMatchupResultStore", () => {
  it("keeps only the latest result for each account and deck", async () => {
    const adapter = createMemoryDatabase().adapters.createPg();
    const accounts = new AccountStore(new adapter.Pool() as never);
    const owner = await accounts.accountForIdentity("discord", "owner", "owner");
    const other = await accounts.accountForIdentity("discord", "other", "other");
    let now = 1_000;
    const results = new DeckMatchupResultStore(accounts, () => now);

    await results.save({ accountId: owner.id, deckId: "deck-1", deckKey: "old", job: job(0.25) });
    now = 2_000;
    await results.save({ accountId: owner.id, deckId: "deck-1", deckKey: "new", job: job(0.75) });

    expect(await results.latest({ accountId: owner.id, deckId: "deck-1" })).toEqual({
      deckKey: "new",
      savedAt: new Date(2_000).toISOString(),
      job: job(0.75),
    });
    expect(await results.latest({ accountId: other.id, deckId: "deck-1" })).toBeUndefined();
    expect(await results.latest({ accountId: owner.id, deckId: "deck-2" })).toBeUndefined();
  });

  it("drops a deck's saved result when the owner deletes the deck", async () => {
    const adapter = createMemoryDatabase().adapters.createPg();
    const accounts = new AccountStore(new adapter.Pool() as never);
    const owner = await accounts.accountForIdentity("discord", "owner", "owner");
    const kept = await accounts.saveDeck(owner.id, { name: "Kept", mainDeck: Array(50).fill("BT1-010"), eggDeck: [] });
    const removed = await accounts.saveDeck(owner.id, {
      name: "Removed",
      mainDeck: Array(50).fill("BT1-010"),
      eggDeck: [],
    });
    const results = new DeckMatchupResultStore(accounts);
    await results.save({ accountId: owner.id, deckId: kept.id, deckKey: "kept", job: job(0.5) });
    await results.save({ accountId: owner.id, deckId: removed.id, deckKey: "removed", job: job(0.5) });

    expect(await accounts.deleteDeck(owner.id, removed.id)).toBe(true);

    expect(await results.latest({ accountId: owner.id, deckId: removed.id })).toBeUndefined();
    expect((await results.latest({ accountId: owner.id, deckId: kept.id }))?.deckKey).toBe("kept");
  });
});
