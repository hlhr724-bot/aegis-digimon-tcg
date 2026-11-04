import { describe, expect, it } from "vitest";
import { matchupDeckKey } from "#shared/deckSimulation/matchupDeckKey";

describe("matchupDeckKey", () => {
  it("ignores card order and changes when a card changes", () => {
    const key = matchupDeckKey({ mainDeck: ["BT1-010", "BT1-009"], eggDeck: ["BT1-001"] });
    expect(matchupDeckKey({ mainDeck: ["BT1-009", "BT1-010"], eggDeck: ["BT1-001"] })).toBe(key);
    expect(matchupDeckKey({ mainDeck: ["BT1-009", "BT1-011"], eggDeck: ["BT1-001"] })).not.toBe(key);
  });
});
