import { describe, expect, it } from "vitest";
import { RED_DECK, BLUE_DECK } from "#api/engine/testDecks";
import { parseMatchupRequest } from "#api/deckSimulation/parseMatchupRequest";

const deck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };
const COMMUNITY_ID = "11111111-1111-4111-8111-111111111111";

describe("parseMatchupRequest", () => {
  it("reads a famous, mirror or explicit opponent with a single-opponent game count", () => {
    expect(parseMatchupRequest({ deck, opponent: { famousDeckId: "bt1-red-omnimon" }, games: 20 })).toMatchObject({
      gamesPerOpponent: 20,
      opponent: { kind: "famous", famousDeckId: "bt1-red-omnimon" },
    });
    expect(parseMatchupRequest({ deck, opponent: { mirror: true }, games: 10 }).opponent).toEqual({ kind: "mirror" });
    const explicit = parseMatchupRequest({
      deck,
      opponent: { name: "  Blue test  ", deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck } },
      games: 40,
    });
    expect(explicit.opponent).toMatchObject({ kind: "list", name: "Blue test" });
  });

  it("reads chosen community deck ids or the default set with a per-opponent game count", () => {
    expect(
      parseMatchupRequest({ deck, opponent: { community: { deckIds: [COMMUNITY_ID] } }, games: 8 }).opponent,
    ).toEqual({ kind: "community", deckIds: [COMMUNITY_ID] });
    expect(parseMatchupRequest({ deck, opponent: { community: {} }, games: 4 }).opponent).toEqual({
      kind: "community",
      deckIds: undefined,
    });
  });

  it.each([
    [{ deck, opponent: { mirror: true }, games: 1000 }, "invalid_games"],
    [{ deck, opponent: { community: {} }, games: 20 }, "invalid_games"],
    [{ deck, opponent: { community: { deckIds: ["not-a-uuid"] } }, games: 4 }, "invalid_opponent"],
    [{ deck, opponent: { community: { deckIds: [COMMUNITY_ID, COMMUNITY_ID] } }, games: 4 }, "invalid_opponent"],
    [
      {
        deck,
        opponent: {
          community: { deckIds: Array.from({ length: 6 }, (_, index) => COMMUNITY_ID.slice(0, -1) + index) },
        },
        games: 4,
      },
      "invalid_opponent",
    ],
    [{ deck: { mainDeck: ["BT1-010"], eggDeck: [] }, opponent: { mirror: true }, games: 10 }, "invalid_deck"],
    [{ deck, opponent: { mirror: true }, games: 10, format: "nonsense" }, "invalid_format"],
    [null, "invalid_request"],
  ])("rejects %j with %s", (input, code) => {
    expect(() => parseMatchupRequest(input)).toThrow(code);
  });
});
