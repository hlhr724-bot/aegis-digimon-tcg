import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { getOptionMainEffect } from "@/game/overlay/choice/getOptionMainEffect";

function mainEffectOf(cardId: string): string {
  return getOptionMainEffect(getCardDefinition(cardId)?.optionEffect ?? "");
}

describe("getOptionMainEffect", () => {
  it("drops the security cost rule and use requirement from Jupitermon", () => {
    expect(mainEffectOf("BT26-033")).toBe(
      "[Main] Delete all of your opponent's Digimon with the lowest DP. Then, ＜Recovery +1＞",
    );
  });

  it("drops a cost reduction rule", () => {
    expect(mainEffectOf("LM-066")).toMatch(/^\[Main\] 1 of your opponent's Digimon or Tamers can't unsuspend/);
  });

  it("drops an alternate use from the trash", () => {
    expect(mainEffectOf("LM-068")).toBe(
      "[Main] Delete 1 of your opponent's Digimon with a level as high as the number of cards in your hand or higher.",
    );
  });

  it("drops the use requirement and the Arts Digivolve keyword", () => {
    expect(mainEffectOf("EX14-012")).toBe("[Main] Delete up to 15000 DP total worth of your opponent's Digimon.");
  });

  it("keeps continuation lines and stops at the next timing", () => {
    const optionEffect =
      "Use Req. ＜[TS] trait＞\n[Main] Delete 1 Digimon.\nThen, ＜Recovery +1＞\n[Security] Activate this card's [Main] effect.";
    expect(getOptionMainEffect(optionEffect)).toBe("[Main] Delete 1 Digimon.\nThen, ＜Recovery +1＞");
  });

  it("falls back to the full text without a Main effect", () => {
    expect(getOptionMainEffect(" [Security] Gain 1 memory. ")).toBe("[Security] Gain 1 memory.");
  });
});
