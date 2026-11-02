import { describe, expect, it } from "vitest";
import { CardFinish } from "@/design/webglCard/CardFinish";
import { getCardFinish } from "@/design/webglCard/getCardFinish";

describe("getCardFinish", () => {
  it("leaves common, uncommon, promo and unknown cards without foil", () => {
    expect(getCardFinish({ rarity: "C" })).toBe(CardFinish.NONE);
    expect(getCardFinish({ rarity: "U" })).toBe(CardFinish.NONE);
    expect(getCardFinish({ rarity: "P" })).toBe(CardFinish.NONE);
    expect(getCardFinish({ rarity: "constructor" })).toBe(CardFinish.NONE);
    expect(getCardFinish({})).toBe(CardFinish.NONE);
    expect(getCardFinish(undefined)).toBe(CardFinish.NONE);
  });

  it("raises the foil with the printed rarity", () => {
    expect(getCardFinish({ rarity: "R" })).toBe(CardFinish.HOLO);
    expect(getCardFinish({ rarity: "SR" })).toBe(CardFinish.STARLIGHT);
    expect(getCardFinish({ rarity: "UR" })).toBe(CardFinish.GOLD);
    expect(getCardFinish({ rarity: "SEC" })).toBe(CardFinish.PRISMATIC);
  });

  it("gives every alternate art the prismatic foil", () => {
    expect(getCardFinish({ rarity: "C", artId: "BT1-010-P1" })).toBe(CardFinish.PRISMATIC);
  });
});
