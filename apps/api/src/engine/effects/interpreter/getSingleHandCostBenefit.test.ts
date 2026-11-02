import { describe, expect, it } from "vitest";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import { getSingleHandCostBenefit } from "#api/engine/effects/interpreter/getSingleHandCostBenefit";
import { getSingleHandActionCostBenefit } from "#api/engine/effects/interpreter/getSingleHandActionCostBenefit";

const cost: Cost = { kind: "trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } };

function getDraw(): Extract<Action, { kind: "Draw" }> {
  return { kind: "Draw", amount: 2, controller: "mine", optional: true, cost };
}

describe("certified resources behind one own-hand payment", () => {
  it("accepts the optional payer while leaving the original IR untouched", () => {
    const action = getDraw();
    const original = structuredClone(action);
    const summary = getSingleHandActionCostBenefit({ action });
    expect(summary).toEqual({ cardsDrawn: 2, memoryGain: 0, cardsRecovered: 0 });
    expect(Object.isFrozen(summary)).toBe(true);
    expect(getSingleHandActionCostBenefit({ action })).toBe(summary);
    expect(action).toEqual(original);
  });

  it("includes only unconditional immediate resources behind a whole-clause cost", () => {
    expect(
      getSingleHandCostBenefit({
        cost,
        actions: [
          { kind: "Recover" },
          { kind: "Draw", controller: "mine", amount: 1 },
          { kind: "GainMemory", amount: 2 },
        ],
      }),
    ).toEqual({ cardsDrawn: 1, memoryGain: 2, cardsRecovered: 1 });
  });

  it("supports a single cost-gated wrapper with no additional nested payment", () => {
    const action: Action = {
      kind: "CostGatedBlock",
      optional: true,
      cost,
      actions: [{ kind: "Draw", controller: "mine", amount: 2 }],
    };
    expect(getSingleHandActionCostBenefit({ action })).toEqual({ cardsDrawn: 2, memoryGain: 0, cardsRecovered: 0 });
  });

  it("rejects a numeric evolution cost instead of treating it as a hand payment", () => {
    const action = JSON.parse('{"kind":"DigivolveViaPlacement","cost":0}');
    expect(getSingleHandActionCostBenefit({ action })).toBeUndefined();
  });

  it.each([
    { untilHandSize: 5 },
    { condition: { kind: "true" } },
    { scaling: { kind: "anything" } },
    { additionalCost: { kind: "deleteOwn", target: { filter: { isSelfRef: true }, count: 1 } } },
    { additionalCosts: [{ kind: "payMemory", memory: 1 }] },
    { costOptions: [{ kind: "payMemory", memory: 1 }] },
    { payCostBeforeOptional: true },
    { amount: Infinity },
    { controller: "opponent" },
    { controller: "both" },
    { futureModifier: true },
  ])("rejects unresolved modifiers and extra resources: %j", (modifiers) => {
    const action = JSON.parse(JSON.stringify({ ...getDraw(), ...modifiers }));
    expect(getSingleHandActionCostBenefit({ action })).toBeUndefined();
  });

  it.each([
    { ...cost, optional: true },
    { kind: "compound", costs: [cost, { kind: "payMemory", memory: 1 }] },
    { ...cost, target: { ...cost.target!, count: 2 } },
    { ...cost, target: { ...cost.target!, untilHandSize: 4 } },
    { ...cost, target: { filter: { controller: "opponent", zone: "hand" }, count: 1 } },
    { ...cost, target: { filter: { controller: "mine", zone: "trash" }, count: 1 } },
  ])("rejects costs that are not exactly one gated own-hand discard: %j", (payment) => {
    const action = JSON.parse(JSON.stringify({ ...getDraw(), cost: payment }));
    expect(getSingleHandActionCostBenefit({ action })).toBeUndefined();
  });

  it("rejects unknown and optional sibling actions rather than advertising partial gains", () => {
    expect(
      getSingleHandCostBenefit({
        cost,
        actions: [
          { kind: "Draw", amount: 2, controller: "mine" },
          { kind: "Recover", optional: true },
        ],
      }),
    ).toBeUndefined();
    expect(
      getSingleHandCostBenefit({
        cost,
        actions: [
          { kind: "Draw", amount: 2, controller: "mine" },
          { kind: "RawUnparsed", text: "unknown" },
        ],
      }),
    ).toBeUndefined();
    expect(getSingleHandCostBenefit({ cost, actions: [getDraw()] })).toBeUndefined();
  });
});
