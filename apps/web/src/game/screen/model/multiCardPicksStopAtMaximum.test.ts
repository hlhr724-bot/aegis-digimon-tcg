import { describe, expect, it } from "vitest";
import { decisionAllowsPick, nextDecisionPicks } from "./decisionPicks";

describe("multi-card decision picks stop at the maximum", () => {
  const candidates = new Map([
    ["handSukamon", "BT14-034"],
    ["handChuumon", "BT3-061"],
    ["trashSukamon", "BT14-034"],
    ["trashChuumon", "BT3-061"],
  ]);
  const allows = (instanceId: string, picks: string[], decisionMax: number) =>
    decisionAllowsPick({
      instanceId,
      picks,
      decisionSelectable: new Set(candidates.keys()),
      decisionInstanceColors: new Map(),
      decisionDifferentColors: false,
      decisionVisibleCardIds: candidates,
      decisionDistinctCardIds: false,
      decisionMax,
    });

  it("keeps the first two picks when a third and fourth card are clicked for an up-to-2 play", () => {
    const clicks = ["handSukamon", "handChuumon", "trashSukamon", "trashChuumon"];
    const picks = clicks.reduce<string[]>(
      (current, instanceId) => nextDecisionPicks({ picks: current, instanceId, max: 2 }),
      [],
    );

    expect(picks).toEqual(["handSukamon", "handChuumon"]);
  });

  it("offers no further candidate once the maximum is picked, but still allows deselection", () => {
    const picks = ["handSukamon", "handChuumon"];

    expect(allows("trashSukamon", picks, 2)).toBe(false);
    expect(allows("handChuumon", picks, 2)).toBe(true);
    expect(allows("trashSukamon", ["handSukamon"], 2)).toBe(true);
  });

  it("still swaps the single pick of a one-card decision", () => {
    expect(nextDecisionPicks({ picks: ["handSukamon"], instanceId: "trashSukamon", max: 1 })).toEqual(["trashSukamon"]);
    expect(allows("trashSukamon", ["handSukamon"], 1)).toBe(true);
  });
});
