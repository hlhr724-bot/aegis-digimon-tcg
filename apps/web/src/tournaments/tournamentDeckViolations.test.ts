import { describe, expect, it } from "vitest";
import { tournamentDeckViolations } from "@/tournaments/tournamentDeckViolations";

const fullDeck = Array.from({ length: 50 }, () => "ST1-01");

describe("tournamentDeckViolations", () => {
  it("accepts a complete deck that respects the frozen banlist", () => {
    expect(tournamentDeckViolations({ deck: { mainDeck: fullDeck, eggDeck: [] }, banlistCards: [] })).toEqual([]);
  });

  it("flags an incomplete main deck and an oversized egg deck", () => {
    const eggDeck = Array.from({ length: 6 }, () => "ST1-01");
    expect(tournamentDeckViolations({ deck: { mainDeck: fullDeck.slice(4), eggDeck }, banlistCards: [] })).toEqual([
      { kind: "main_deck_size", size: 46, required: 50 },
      { kind: "egg_deck_size", size: 6, max: 5 },
    ]);
  });

  it("flags banned cards and restricted cards above their frozen copy limit", () => {
    const mainDeck = [...fullDeck.slice(4), "BT5-109", "BT2-047", "BT2-047", "EX2-007"];
    expect(
      tournamentDeckViolations({
        deck: { mainDeck, eggDeck: [] },
        banlistCards: [
          { cardId: "BT5-109", status: "banned", allowedCopies: 0 },
          { cardId: "BT2-047", status: "restricted", allowedCopies: 1 },
          { cardId: "EX2-007", status: "banned_pair", allowedCopies: 4, pairPartnerIds: ["BT7-072"] },
        ],
      }),
    ).toEqual([
      { kind: "banned", cardId: "BT5-109" },
      { kind: "over_copy_limit", cardId: "BT2-047", copies: 2, allowed: 1 },
    ]);
  });
});
