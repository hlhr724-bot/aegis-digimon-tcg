import { describe, expect, it } from "vitest";
import { isAllowedTargetSelection } from "@/game/screen/model/isAllowedTargetSelection";
import { decisionAllowsPick } from "@/game/screen/model/decisionPicks";

const combinations = [
  ["alpha-one", "ouryu-one"],
  ["alpha-two", "ouryu-one"],
];

function canPick(instanceId: string, picks: string[]) {
  return decisionAllowsPick({
    instanceId,
    picks,
    decisionSelectable: new Set(combinations.flat()),
    decisionAllowedTargetCombinations: combinations,
    decisionInstanceColors: new Map(),
    decisionDifferentColors: false,
    decisionVisibleCardIds: new Map(),
    decisionDistinctCardIds: false,
  });
}

describe("DNA material selection", () => {
  it("allows either material first and only compatible partners afterward", () => {
    expect(canPick("ouryu-one", [])).toBe(true);
    expect(canPick("alpha-one", ["ouryu-one"])).toBe(true);
    expect(canPick("alpha-two", ["ouryu-one"])).toBe(true);
    expect(canPick("alpha-two", ["alpha-one"])).toBe(false);
    expect(canPick("ouryu-one", ["alpha-one"])).toBe(true);
  });

  it("allows deselecting either material and choosing a different legal pair", () => {
    expect(canPick("ouryu-one", ["ouryu-one", "alpha-one"])).toBe(true);
    expect(canPick("alpha-one", ["ouryu-one", "alpha-one"])).toBe(true);
    expect(canPick("alpha-two", ["ouryu-one"])).toBe(true);
  });

  it.each([
    { picks: ["alpha-one"], valid: false },
    { picks: ["alpha-one", "alpha-two"], valid: false },
    { picks: ["alpha-one", "alpha-one"], valid: false },
    { picks: ["ouryu-one", "alpha-two"], valid: true },
    { picks: ["alpha-two", "ouryu-one"], valid: true },
  ])("confirms only complete legal pairs: $picks", ({ picks, valid }) => {
    expect(isAllowedTargetSelection({ allowedTargetCombinations: combinations, picks, complete: true })).toBe(valid);
  });
});
