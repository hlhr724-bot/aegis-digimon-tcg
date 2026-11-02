import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { describe, expect, it } from "vitest";
import { ParticipantStore } from "../tournaments/participants/index.js";
import { AccountStore, type Account } from "./AccountStore.js";

// Organizer-only hard delete, refused from the moment the event starts. Verified against a live
// pg-mem schema so the child-table delete order breaks loudly if a migration adds an FK this
// method forgot.

function createStore(): AccountStore {
  const adapter = createMemoryDatabase().adapters.createPg();
  return new AccountStore(new adapter.Pool() as never);
}

async function account(store: AccountStore, subject: string): Promise<Account> {
  return store.accountForIdentity("discord", subject, subject);
}

async function createTournament(store: AccountStore, createdBy: string): Promise<string> {
  const created = await store.createTournament(createdBy, {
    name: "Friday lightning",
    block: "BT10",
    startsAt: Date.now() + 3_600_000,
    maxPlayers: 8,
  });
  return created.id;
}

describe("AccountStore.deleteTournament", () => {
  it("deletes a registration-stage event with its sign-ups, for the creator only", async () => {
    const store = createStore();
    const organizer = await account(store, "organizer");
    const player = await account(store, "player");
    const id = await createTournament(store, organizer.id);
    expect(await store.registerTournament(id, player.id)).toBe(true);
    const participants = new ParticipantStore(store);
    const deck = await store.saveDeck(player.id, { name: "Deck", mainDeck: Array(50).fill("BT1-010"), eggDeck: [] });
    await participants.register({ tournamentId: id, accountId: player.id, savedDeckId: deck.id });

    expect(await store.deleteTournament(id, player.id)).toBe("forbidden");
    expect(await store.deleteTournament(id, organizer.id)).toBe("deleted");
    expect(await store.tournament(id)).toBeUndefined();
    expect(await store.deleteTournament(id, organizer.id)).toBe("not_found");
  });

  it("refuses once the event has started", async () => {
    const store = createStore();
    const organizer = await account(store, "organizer");
    const p0 = await account(store, "p0");
    const p1 = await account(store, "p1");
    const id = await createTournament(store, organizer.id);
    expect(await store.registerTournament(id, p0.id)).toBe(true);
    expect(await store.registerTournament(id, p1.id)).toBe(true);
    expect(await store.startTournament(id, organizer.id)).toBe(true);

    expect(await store.deleteTournament(id, organizer.id)).toBe("already_started");
    expect(await store.tournament(id)).toBeDefined();
  });

  it("lets an administrator bypass creator ownership before the event starts", async () => {
    const store = createStore();
    const organizer = await account(store, "organizer");
    const admin = await account(store, "admin");
    const id = await createTournament(store, organizer.id);

    expect(await store.deleteTournament(id, admin.id, true)).toBe("deleted");
    expect(await store.tournament(id)).toBeUndefined();
  });
});
