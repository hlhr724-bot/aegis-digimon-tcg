import { describe, expect, it } from "vitest";
import { RED_DECK, BLUE_DECK } from "#api/engine/testDecks";
import { parseMatchupRequest } from "#api/deckSimulation/parseMatchupRequest";

const deck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };

describe("parseMatchupRequest", () => {
  it("resolves a famous opponent deck on the server", () => {
    const request = parseMatchupRequest({ deck, opponent: { famousDeckId: "bt1-red-omnimon" }, games: 20 });
    expect(request.games).toBe(20);
    expect(request.opponentName).toBe("Red Aggro");
    expect(request.opponent.mainDeck).toHaveLength(50);
  });

  it("accepts a mirror match and an explicit opponent list", () => {
    expect(parseMatchupRequest({ deck, opponent: { mirror: true }, games: 10 }).opponent).toEqual(deck);
    const explicit = parseMatchupRequest({
      deck,
      opponent: { name: "  Blue test  ", deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck } },
      games: 40,
    });
    expect(explicit.opponentName).toBe("Blue test");
  });

  it.each([
    [{ deck, opponent: { mirror: true }, games: 1000 }, "invalid_games"],
    [{ deck: { mainDeck: ["BT1-010"], eggDeck: [] }, opponent: { mirror: true }, games: 10 }, "invalid_deck"],
    [{ deck, opponent: { famousDeckId: "missing" }, games: 10 }, "invalid_opponent"],
    [{ deck, opponent: { mirror: true }, games: 10, format: "nonsense" }, "invalid_format"],
    [null, "invalid_request"],
  ])("rejects %j with %s", (input, code) => {
    expect(() => parseMatchupRequest(input)).toThrow(code);
  });
});
