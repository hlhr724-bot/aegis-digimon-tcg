import { describe, expect, it, vi } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import type { CommunityMatchupDecks } from "#api/deckSimulation/CommunityMatchupDecks";
import type { MatchupRequestDraft } from "#api/deckSimulation/MatchupRequestDraft";
import { resolveMatchupRequest } from "#api/deckSimulation/resolveMatchupRequest";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

function draft(opponent: MatchupRequestDraft["opponent"]): MatchupRequestDraft {
  return { deck: RED_DECK, format: undefined, gamesPerOpponent: 4, opponent };
}

function communityDecks(found: { id: string; name: string }[]) {
  const matchupOpponents = vi.fn<CommunityMatchupDecks["matchupOpponents"]>(async () =>
    found.map(({ id, name }) => ({
      id,
      name,
      mainDeck: BLUE_DECK.mainDeck,
      eggDeck: BLUE_DECK.eggDeck,
      coverCardId: "BT1-085",
      colors: ["Blue"],
    })),
  );
  return { matchupOpponents };
}

describe("resolveMatchupRequest", () => {
  it("loads the server's default community set when no deck is chosen", async () => {
    const store = communityDecks([
      { id: FIRST_ID, name: "Popular" },
      { id: SECOND_ID, name: "Recent" },
    ]);
    const request = await resolveMatchupRequest({
      draft: draft({ kind: "community", deckIds: undefined }),
      communityDecks: store,
    });
    expect(store.matchupOpponents).toHaveBeenCalledWith({ format: undefined, deckIds: undefined, limit: 5 });
    expect(request.opponents.map((opponent) => [opponent.name, opponent.communityDeckId])).toEqual([
      ["Popular", FIRST_ID],
      ["Recent", SECOND_ID],
    ]);
    expect(request.opponents[0]).toMatchObject({ coverCardId: "BT1-085", colors: ["Blue"] });
    expect(request.gamesPerOpponent).toBe(4);
  });

  it("rejects chosen community decks that are hidden, private or illegal for the format", async () => {
    const store = communityDecks([{ id: FIRST_ID, name: "Still public" }]);
    await expect(
      resolveMatchupRequest({
        draft: draft({ kind: "community", deckIds: [FIRST_ID, SECOND_ID] }),
        communityDecks: store,
      }),
    ).rejects.toThrow("invalid_opponent");
  });

  it("rejects an empty default set", async () => {
    await expect(
      resolveMatchupRequest({
        draft: draft({ kind: "community", deckIds: undefined }),
        communityDecks: communityDecks([]),
      }),
    ).rejects.toThrow("invalid_opponent");
  });

  it("resolves a famous deck and a mirror as one opponent each", async () => {
    const store = communityDecks([]);
    const famous = await resolveMatchupRequest({
      draft: draft({ kind: "famous", famousDeckId: "bt1-red-omnimon" }),
      communityDecks: store,
    });
    expect(famous.opponents).toHaveLength(1);
    expect(famous.opponents[0]!.name).toBe("Red Aggro");
    const mirror = await resolveMatchupRequest({ draft: draft({ kind: "mirror" }), communityDecks: store });
    expect(mirror.opponents[0]!.deck).toBe(RED_DECK);
    expect(store.matchupOpponents).not.toHaveBeenCalled();
  });
});
