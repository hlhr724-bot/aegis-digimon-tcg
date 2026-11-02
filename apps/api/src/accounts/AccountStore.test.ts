import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { describe, expect, it, vi } from "vitest";
import { AccountStore, DisplayNameTakenError, InvalidDisplayNameError } from "./AccountStore.js";

function createStore(): AccountStore {
  const adapter = createMemoryDatabase().adapters.createPg();
  return new AccountStore(new adapter.Pool() as never);
}

describe("AccountStore", () => {
  it("persists each copy's art and normalizes foreign arts on save and update", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "art-owner", "Art Owner");
    const deck = await store.saveDeck(account.id, {
      name: "Alternate copies",
      mainDeck: ["AD1-001", "AD1-001"],
      eggDeck: [],
      mainDeckArts: ["AD1-001_P1", "AD1-002_P1"],
    });
    expect(deck.mainDeckArts).toEqual(["AD1-001_P1", "AD1-001"]);
    expect(await store.decks(account.id)).toEqual([deck]);
    const updated = await store.saveDeck(account.id, { ...deck, mainDeckArts: ["AD1-001", "AD1-001_P1"] });
    expect(updated.mainDeckArts).toEqual(["AD1-001", "AD1-001_P1"]);
    expect(await store.decks(account.id)).toEqual([updated]);
    await store.close();
  });
  it("persists the cover card and drops one that is not in the deck", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "cover-owner", "Cover Owner");
    const deck = await store.saveDeck(account.id, {
      name: "Covered",
      mainDeck: ["BT1-010", "BT1-011"],
      eggDeck: ["BT1-001"],
      coverCardId: "BT1-011",
    });
    expect(deck.coverCardId).toBe("BT1-011");
    expect((await store.decks(account.id))[0]?.coverCardId).toBe("BT1-011");
    const foreign = await store.saveDeck(account.id, { ...deck, coverCardId: "BT1-099" });
    expect(foreign.coverCardId).toBeUndefined();
    expect((await store.decks(account.id))[0]?.coverCardId).toBeUndefined();
    await store.close();
  });
  it("persists the deck's own sleeve and clears it back to the global sleeve", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "sleeve-owner", "Sleeve Owner");
    const deck = await store.saveDeck(account.id, {
      name: "Sleeved",
      mainDeck: ["BT1-010"],
      eggDeck: [],
      sleeveId: "alphamon",
    });
    expect(deck.sleeveId).toBe("alphamon");
    expect((await store.decks(account.id))[0]?.sleeveId).toBe("alphamon");
    await store.saveDeck(account.id, { ...deck, sleeveId: undefined });
    expect((await store.decks(account.id))[0]?.sleeveId).toBeUndefined();
    await store.saveDeck(account.id, { ...deck, sleeveId: undefined, eggSleeveId: "gold" });
    expect((await store.decks(account.id))[0]).toMatchObject({ sleeveId: undefined, eggSleeveId: "gold" });
    await store.close();
  });
  it("reports when each deck was last saved, newest first", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "edit-owner", "Edit Owner");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    await store.saveDeck(account.id, { name: "First", mainDeck: [], eggDeck: [] });
    clock.mockReturnValue(2_000);
    await store.saveDeck(account.id, { name: "Second", mainDeck: [], eggDeck: [] });
    clock.mockRestore();
    const decks = await store.decks(account.id);
    expect(decks.map((deck) => [deck.name, deck.updatedAt])).toEqual([
      ["Second", 2_000],
      ["First", 1_000],
    ]);
    await store.close();
  });
  it("keeps a verified email account, session and decks together", async () => {
    const store = createStore();
    const link = await store.createMagicLink("Player@example.com");
    const account = (await store.consumeMagicLink(link.token))!;
    expect(account.displayName).toBe("player");
    expect(await store.consumeMagicLink(link.token)).toBeUndefined();
    const session = await store.issueSession(account);
    expect((await store.session(session.id))?.account.id).toBe(account.id);
    const deck = await store.saveDeck(account.id, { name: "Blue", mainDeck: ["BT1-001"], eggDeck: ["BT1-002"] });
    expect(await store.decks(account.id)).toEqual([deck]);
    expect(await store.deleteDeck(account.id, deck.id)).toBe(true);
    await store.close();
  });
  it("uses one account for a repeated provider identity", async () => {
    const store = createStore();
    const first = await store.accountForIdentity("discord", "42", "Tamer");
    expect(await store.accountForIdentity("discord", "42", "Other Name")).toEqual(first);
    await store.close();
  });
  it("refreshes the Discord avatar on each sign-in", async () => {
    const store = createStore();
    const first = await store.accountForIdentity("discord", "43", "Tamer");
    expect(first.avatarUrl).toBeNull();
    const refreshed = await store.accountForIdentity("discord", "43", "Tamer", "https://cdn.discordapp.com/a.png");
    expect(refreshed).toEqual({ ...first, avatarUrl: "https://cdn.discordapp.com/a.png", avatarSource: "discord" });
    expect((await store.accountForIdentity("discord", "43", "Tamer", null)).avatarUrl).toBeNull();
    await store.close();
  });
  it("reserves account nicknames case-insensitively without suffix collisions", async () => {
    const store = createStore();
    expect((await store.accountForIdentity("discord", "n1", "Tamer")).displayName).toBe("Tamer");
    expect((await store.accountForIdentity("discord", "n2", "tamer")).displayName).toBe("tamer-2");
    expect((await store.accountForIdentity("discord", "n3", "Tamer")).displayName).toBe("Tamer-3");
    expect((await store.accountForIdentity("discord", "n4", "TAMER-2")).displayName).toBe("TAMER-2-2");
    await store.close();
  });
  it("renames an account repeatedly and normalizes whitespace", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "rename", "First Name");
    expect((await store.updateDisplayName(account.id, "  New   Name  "))?.displayName).toBe("New Name");
    expect((await store.updateDisplayName(account.id, "Another Name"))?.displayName).toBe("Another Name");
    expect((await store.session((await store.issueSession(account)).id))?.account.displayName).toBe("Another Name");
    await store.close();
  });
  it("validates and reserves renamed account nicknames case-insensitively", async () => {
    const store = createStore();
    const first = await store.accountForIdentity("discord", "r1", "First"),
      second = await store.accountForIdentity("discord", "r2", "Second");
    await store.updateDisplayName(first.id, "Unique Name");
    await expect(store.updateDisplayName(second.id, "unique name")).rejects.toBeInstanceOf(DisplayNameTakenError);
    await expect(store.updateDisplayName(second.id, "no!")).rejects.toBeInstanceOf(InvalidDisplayNameError);
    expect((await store.updateDisplayName(second.id, "SECOND"))?.displayName).toBe("SECOND");
    await store.close();
  });
  it("scopes the same local deck id to each account", async () => {
    const store = createStore();
    const first = await store.accountForIdentity("discord", "d1", "First"),
      second = await store.accountForIdentity("discord", "d2", "Second");
    await store.saveDeck(first.id, { id: "starter", name: "First deck", mainDeck: [], eggDeck: [] });
    await store.saveDeck(second.id, { id: "starter", name: "Second deck", mainDeck: [], eggDeck: [] });
    expect((await store.decks(first.id))[0]?.name).toBe("First deck");
    expect((await store.decks(second.id))[0]?.name).toBe("Second deck");
    await store.close();
  });
  it("caps new saved decks at 100 while allowing existing decks to be edited", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "limit", "Deck Limit");
    for (let i = 0; i < 100; i++)
      await store.saveDeck(account.id, { id: `deck-${i}`, name: `Deck ${i}`, mainDeck: [], eggDeck: [] });
    expect(
      (await store.saveDeck(account.id, { id: "deck-0", name: "Updated", mainDeck: ["BT1-001"], eggDeck: [] }))
        .revision,
    ).toBe(2);
    await expect(
      store.saveDeck(account.id, { id: "deck-100", name: "Too many", mainDeck: [], eggDeck: [] }),
    ).rejects.toThrow("at most 100 decks");
    expect(await store.decks(account.id)).toHaveLength(100);
    await store.close();
  });
  it("consumes tickets and records ranked results idempotently", async () => {
    const store = createStore();
    const first = await store.accountForIdentity("discord", "1", "One"),
      second = await store.accountForIdentity("discord", "2", "Two");
    const ticket = await store.createRoomTicket(first.id);
    expect(await store.getRoomTicketAccountId(ticket)).toBe(first.id);
    expect(await store.getRoomTicketAccountId(ticket)).toBe(first.id);
    expect((await store.consumeRoomTicket(ticket))?.account.id).toBe(first.id);
    expect(await store.getRoomTicketAccountId(ticket)).toBeUndefined();
    expect(await store.getRoomTicketAccountId("invalid-ticket")).toBeUndefined();
    expect(await store.getRoomTicketAccountId({ accountId: first.id })).toBeUndefined();
    expect(await store.consumeRoomTicket(ticket)).toBeUndefined();
    const decks = [
      { deckId: "blue", deckName: "Blue", mainDeck: ["BT1-001", "BT1-001"], eggDeck: ["BT1-002"] },
      { deckId: "red", deckName: "Red", mainDeck: ["BT2-001"], eggDeck: [] },
    ];
    expect(
      await store.recordMatch({
        roomId: "room-1",
        mode: "ranked",
        playerAccountIds: [first.id, second.id],
        winnerAccountId: first.id,
        reason: "security",
        deckSnapshots: [decks[0]!, decks[1]!],
      }),
    ).toBe(true);
    expect(
      await store.recordMatch({
        roomId: "room-1",
        mode: "ranked",
        playerAccountIds: [first.id, second.id],
        winnerAccountId: second.id,
        reason: "duplicate",
      }),
    ).toBe(false);
    expect((await store.profile(first.id)).stats.rankedWins).toBe(1);
    expect((await store.profile(first.id)).decks[0]).toMatchObject({ deckName: "Blue", wins: 1, matches: 1 });
    expect(await store.recordRankedDodge("room-1", second.id)).toBe(true);
    expect(await store.recordRankedDodge("room-1", second.id)).toBe(false);
    await store.close();
  });
  it("completes a tournament through authoritative rooms", async () => {
    const store = createStore();
    const organizer = await store.accountForIdentity("discord", "org", "Organizer");
    const players = [
      organizer,
      await store.accountForIdentity("discord", "p2", "P2"),
      await store.accountForIdentity("discord", "p3", "P3"),
    ];
    const tournament = await store.createTournament(organizer.id, {
      name: "BT Tournament",
      block: "BT10",
      startsAt: Date.now(),
      maxPlayers: 8,
    });
    for (const player of players) expect(await store.registerTournament(tournament.id, player.id)).toBe(true);
    expect(await store.startTournament(tournament.id, organizer.id)).toBe(true);
    const semifinal = (await store.tournamentMatches(tournament.id)).find((m) => m.status === "pending")!;
    expect(await store.claimTournamentRoom(semifinal.id, "room-1")).toBe(true);
    expect(
      await store.recordTournamentRoomResult(
        semifinal.id,
        "room-1",
        [semifinal.player0AccountId!, semifinal.player1AccountId!],
        semifinal.player0AccountId!,
        "security",
      ),
    ).toBe(true);
    const final = (await store.tournamentMatches(tournament.id)).find((m) => m.round === 2)!;
    expect(await store.claimTournamentRoom(final.id, "room-2")).toBe(true);
    expect(
      await store.recordTournamentRoomResult(
        final.id,
        "room-2",
        [final.player0AccountId!, final.player1AccountId!],
        final.player0AccountId!,
        "security",
      ),
    ).toBe(true);
    expect(await store.tournament(tournament.id)).toMatchObject({
      status: "finished",
      winnerAccountId: final.player0AccountId,
    });
    await store.close();
  });
});
