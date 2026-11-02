import { describe, expect, it } from "vitest";
import { printedSentence } from "#api/engine/decisions/printedSentence";

describe("printedSentence", () => {
  it("returns the whole later sentence that contains the passage", () => {
    expect(
      printedSentence(
        "[Main] 1 of your opponent's Digimon gets -8000 DP for the turn. Then, by trashing your top security card, all of your opponent's Digimon get -5000 DP for the turn.",
        "by trashing your top security card",
      ),
    ).toBe("Then, by trashing your top security card, all of your opponent's Digimon get -5000 DP for the turn.");
  });

  it("drops leading timing headers from a first sentence", () => {
    expect(printedSentence("[Main] [Once Per Turn] By paying 1 cost, ＜Draw 1＞.", "By paying 1 cost")).toBe(
      "By paying 1 cost, ＜Draw 1＞.",
    );
  });

  it("does not split at a dot inside a level reference", () => {
    expect(
      printedSentence(
        "Delete 1 Digimon. Then, by trashing 1 Lv.5 card from your hand, draw 1.",
        "by trashing 1 Lv.5 card from your hand",
      ),
    ).toBe("Then, by trashing 1 Lv.5 card from your hand, draw 1.");
  });

  it("returns undefined when the passage is not printed", () => {
    expect(printedSentence("Delete 1 Digimon.", "by trashing your top security card")).toBeUndefined();
  });
});
