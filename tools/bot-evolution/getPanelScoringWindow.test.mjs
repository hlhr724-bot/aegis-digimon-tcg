import assert from "node:assert/strict";
import test from "node:test";
import { getPanelScoringWindow } from "./getPanelScoringWindow.mjs";

test("historical activation scoring removes only new activation costs without mutating the live catalog", () => {
  const activation = {
    intent: { type: "activateEffect" },
    projectedCost: 3,
    activationMemoryCost: { minimum: 3, maximum: 3 },
    sourceId: "effect",
  };
  const play = { intent: { type: "playCard" }, projectedCost: 4 };
  const window = { kind: "main", actions: [activation, play], observation: { memory: 1 } };
  const result = getPanelScoringWindow({ window, activationMemoryCosts: false });
  assert.deepEqual(result.actions[0], { intent: { type: "activateEffect" }, sourceId: "effect" });
  assert.equal(result.actions[1], play);
  assert.equal(result.observation, window.observation);
  assert.equal(activation.projectedCost, 3);
  assert.deepEqual(activation.activationMemoryCost, { minimum: 3, maximum: 3 });
});

test("current scoring and non-main windows retain their original action information", () => {
  const window = { kind: "main", actions: [] };
  assert.equal(getPanelScoringWindow({ window, activationMemoryCosts: true }), window);
  const selection = { kind: "chooseCards", actions: [] };
  assert.equal(getPanelScoringWindow({ window: selection, activationMemoryCosts: false }), selection);
});

test("historical decision scoring removes only new semantics and preserves public candidates and purpose", () => {
  const options = {
    candidateInstanceIds: ["opaque-a", "opaque-b"],
    purpose: "cost",
    targetFate: "trash",
    selectionGoal: "discard",
    effectControllerSeat: 0,
    effectSummary: { memoryGain: 2 },
    singleHandCostBenefit: { cardsDrawn: 2, memoryGain: 0, cardsRecovered: 0 },
    choiceSummaries: [null],
    triggerSummaries: [null],
    triggerControllerSeats: [0],
  };
  const window = { kind: "selectCards", actions: [], request: { kind: "selectCards", options } };
  const before = structuredClone(window);
  const scoring = getPanelScoringWindow({ window, activationMemoryCosts: true, decisionContext: false });
  assert.deepEqual(scoring.request.options, {
    candidateInstanceIds: ["opaque-a", "opaque-b"],
    purpose: "cost",
    targetFate: "trash",
  });
  assert.equal(scoring.actions, window.actions);
  assert.deepEqual(window, before);
  assert.equal(getPanelScoringWindow({ window, activationMemoryCosts: true, decisionContext: true }), window);
});
