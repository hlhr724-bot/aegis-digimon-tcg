import { describe, expect, it } from "vitest";
import { CardFinish } from "@/design/webglCard/CardFinish";
import { getCardDetailFinish } from "@/game/overlay/viewer/cardFoil/getCardDetailFinish";

describe("getCardDetailFinish", () => {
  it("matches the pack opening foil for the printed rarity", () => {
    expect(getCardDetailFinish({ cardId: "BT1-010" })).toBe(CardFinish.HOLO);
  });

  it("shows an Ultimate Rare from a set without that rarity as a Secret Rare", () => {
    expect(getCardDetailFinish({ cardId: "BT11-111" })).toBe(CardFinish.PRISMATIC);
  });

  it("keeps the gold foil for an Ultimate Rare from a set that prints it", () => {
    expect(getCardDetailFinish({ cardId: "BT25-043" })).toBe(CardFinish.GOLD);
  });

  it("gives a parallel art the prismatic foil", () => {
    expect(getCardDetailFinish({ cardId: "BT1-010", artId: "BT1-010_P1" })).toBe(CardFinish.PRISMATIC);
    expect(getCardDetailFinish({ cardId: "BT1-010", artId: "BT1-010_P1-J" })).toBe(CardFinish.PRISMATIC);
  });

  it("keeps the rarity foil for the original art chosen in a deck", () => {
    expect(getCardDetailFinish({ cardId: "BT1-010", artId: "BT1-010" })).toBe(CardFinish.HOLO);
  });

  it("keeps the rarity foil for a regional printing of the original art", () => {
    expect(getCardDetailFinish({ cardId: "BT1-010", artId: "BT1-010-J" })).toBe(CardFinish.HOLO);
  });

  it("ignores an unknown art ID", () => {
    expect(getCardDetailFinish({ cardId: "BT1-010", artId: "BT1-010-P1" })).toBe(CardFinish.HOLO);
  });

  it("leaves an unknown card without foil", () => {
    expect(getCardDetailFinish({ cardId: "UNKNOWN-001" })).toBe(CardFinish.NONE);
  });
});
