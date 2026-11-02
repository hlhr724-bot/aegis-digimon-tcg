import { describe, expect, it } from "vitest";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";
import { getDecisionActionSummary } from "#api/engine/effects/interpreter/getDecisionActionSummary";
import { getSubTriggerDecisionSummary } from "#api/engine/effects/interpreter/getSubTriggerDecisionSummary";
import { getDecisionSelectionGoal } from "#api/engine/effects/interpreter/getDecisionSelectionGoal";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";

describe("declared context for effect decisions", () => {
  it("summarizes immediate resources and leaves deferred bodies out of installation", () => {
    const actions: Action[] = [
      { kind: "GainMemory", amount: 2 },
      { kind: "Draw", controller: "mine", amount: 1 },
      { kind: "GainMemory", amount: -3, at: "endOfTurn" },
      { kind: "SubTrigger", event: "whenPlayed", actions: [{ kind: "GainMemory", amount: 5 }] },
    ];
    const before = structuredClone(actions);
    const summary = getDecisionEffectSummary({ actions });
    expect(summary).toMatchObject({ memoryGain: 2, cardsDrawn: 1, memoryCost: { maximum: 0 } });
    expect(Object.isFrozen(summary)).toBe(true);
    expect(getDecisionEffectSummary({ actions })).toBe(summary);
    expect(actions).toEqual(before);
  });

  it("accounts for a watcher's future wrapper payments without charging the installation", () => {
    const action: Extract<Action, { kind: "SubTrigger" }> = {
      kind: "SubTrigger",
      event: "whenPlayed",
      cost: { kind: "payMemory", memory: 2 },
      additionalCost: { kind: "payMemory", memory: 1 },
      actions: [{ kind: "Draw", controller: "mine", amount: 2 }],
    };
    expect(getDecisionActionSummary({ action })).toMatchObject({ cardsDrawn: 0, memoryCost: { maximum: 0 } });
    expect(getSubTriggerDecisionSummary({ action })).toMatchObject({ cardsDrawn: 2, memoryCost: { maximum: 3 } });
  });

  it("charges granting costs immediately and excludes them from a gained future body", () => {
    const action: Extract<Action, { kind: "GainTriggeredEffect" }> = {
      kind: "GainTriggeredEffect",
      target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      gainedTrigger: "whenPlayed",
      cost: { kind: "payMemory", memory: 3 },
      gainedActions: [{ kind: "GainMemory", amount: 2 }],
      duration: "forTheTurn",
    };
    expect(getDecisionActionSummary({ action })).toMatchObject({ memoryGain: 0, memoryCost: { maximum: 3 } });
    expect(getDecisionEffectSummary({ actions: action.gainedActions })).toMatchObject({
      memoryGain: 2,
      memoryCost: { maximum: 0 },
    });
  });

  it("does not invent condition truth or treat a borrowed action as a known outcome", () => {
    const actions = JSON.parse(
      '{"actions":[{"kind":"ConditionalBranch","condition":{"kind":"true"},"ifTrue":[{"kind":"GainMemory","amount":10}]},{"kind":"FutureAction"}]}',
    ).actions;
    expect(getDecisionEffectSummary({ actions })).toMatchObject({ memoryGain: 0, uncertain: true });
  });

  it("keeps opponent drawing distinct from drawing for the controller", () => {
    expect(
      getDecisionEffectSummary({ actions: [{ kind: "Draw", controller: "opponent", amount: 2 }] }).cardsDrawn,
    ).toBe(-2);
  });

  it("uses recovery defaults and distinguishes opposing token recipients", () => {
    expect(getDecisionActionSummary({ action: { kind: "Recover" } }).cardsRecovered).toBe(1);
    expect(
      getDecisionActionSummary({
        action: { kind: "PlayToken", tokens: ["Token"], count: 1, payCost: false, placedAs: "opponentDigimon" },
      }).plays,
    ).toBe(-1);
  });

  it("keeps unscoped unsuspends unknown and honors an explicit opposing default", () => {
    expect(getDecisionActionSummary({ action: { kind: "Unsuspend", target: { filter: {}, count: 1 } } })).toMatchObject(
      { unsuspends: 0, uncertain: true },
    );
    expect(
      getDecisionActionSummary({
        action: { kind: "Unsuspend", target: { filter: { controllerDefault: "opponent" }, count: 1 } },
      }).unsuspends,
    ).toBe(-1);
    expect(
      getDecisionActionSummary({
        action: { kind: "Unsuspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } },
      }).unsuspends,
    ).toBe(1);
  });

  it("does not describe returning an opposing trash card to hand as board removal", () => {
    const action: Action = {
      kind: "Return",
      to: "hand",
      from: ["trash"],
      target: { filter: { controller: "opponent", zone: "trash" }, count: 1 },
    };
    expect(getDecisionActionSummary({ action }).removal).toBe(0);
    expect(getDecisionSelectionGoal({ action })).toBeUndefined();
    expect(
      getDecisionSelectionGoal({
        action: { ...action, target: { filter: { controllerDefault: "opponent", zone: "trash" }, count: 1 } },
      }),
    ).toBeUndefined();
    expect(
      getDecisionSelectionGoal({ action: { ...action, target: { filter: { zone: "trash" }, count: 1 } } }),
    ).toBeUndefined();
    expect(
      getDecisionSelectionGoal({
        action: { ...action, target: { filter: { controller: "mine", zone: "trash" }, count: 1 } },
      }),
    ).toBe(DecisionSelectionGoal.GAIN.value);
  });

  it("bounds recursive and non-finite records without executing them", () => {
    const cyclic = JSON.parse('{"kind":"CostGatedBlock","cost":{"kind":"payMemory","memory":1},"actions":[]}');
    cyclic.actions.push(cyclic);
    expect(getDecisionEffectSummary({ actions: [cyclic] }).uncertain).toBe(true);
    expect(getDecisionEffectSummary({ actions: [{ kind: "GainMemory", amount: Infinity }] })).toMatchObject({
      memoryGain: 0,
      uncertain: true,
    });
  });

  it("distinguishes discard, retrieval, play and ambiguous reveal dispositions", () => {
    expect(getDecisionSelectionGoal({ action: { kind: "HandManipulation", op: "trashVariable", amount: 1 } })).toBe(
      DecisionSelectionGoal.DISCARD.value,
    );
    const reveal: Extract<Action, { kind: "RevealAdd" }> = {
      kind: "RevealAdd",
      revealCount: 2,
      add: [{ filter: {}, count: 1, to: "hand" }],
      rest: "trash",
    };
    expect(getDecisionSelectionGoal({ action: reveal })).toBe(DecisionSelectionGoal.GAIN.value);
    expect(getDecisionSelectionGoal({ action: { ...reveal, add: [{ filter: {}, count: 1, to: "play" }] } })).toBe(
      DecisionSelectionGoal.PLAY.value,
    );
    expect(
      getDecisionSelectionGoal({
        action: { ...reveal, add: [{ filter: {}, count: 1, to: "hand", orDispositions: [{ to: "play" }] }] },
      }),
    ).toBeUndefined();
  });
});
