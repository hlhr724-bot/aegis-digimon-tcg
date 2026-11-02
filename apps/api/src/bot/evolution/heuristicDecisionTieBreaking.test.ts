import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { chooseHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { chooseFastHeuristic } from "#api/bot/evolution/chooseFastHeuristic";
import { createTrainingPolicy } from "#api/bot/training/policy";
import { buildBotView } from "#api/bot/view";
import { setupEngine } from "#api/engine/testkit/harness";

const program: HeuristicProgram = { schemaVersion: 1, title: "Primary-score tie", rules: [] };
const empty: DecisionEffectSummary = {
  memoryGain: 0,
  cardsDrawn: 0,
  cardsRecovered: 0,
  cardsReturnedFromTrash: 0,
  removal: 0,
  plays: 0,
  evolutions: 0,
  unsuspends: 0,
  memoryCost: { minimum: 0, maximum: 0 },
  uncertain: false,
};

for (const fast of [false, true]) {
  describe(`${fast ? "fast" : "traced"} heuristic decision tie-breaking`, () => {
    for (const seed of [1, 2, 100]) {
      it(`recovers the more valuable card at seed ${seed}`, () => {
        const setup = setupEngine({
          0: {
            battleArea: ["BT1-015"],
            hand: [
              { card: "BT1-010", as: "small" },
              { card: "BT1-023", as: "large" },
            ],
          },
        });
        const choose = fast ? chooseFastHeuristic : chooseHeuristic;
        const policy = createTrainingPolicy(setup.engine, 0, (window) => choose(program, window, seed));
        const request: DecisionRequest = {
          decisionId: "gain",
          seat: 0,
          kind: "selectCards",
          promptText: "Gain a card",
          options: {
            selectionGoal: DecisionSelectionGoal.GAIN.value,
            candidateInstanceIds: [setup.inst("small").instanceId, setup.inst("large").instanceId],
            min: 1,
            max: 1,
          },
        };
        expect(policy.answerDecision(buildBotView(setup.state, 0), request)).toMatchObject({
          response: { instanceIds: [setup.inst("large").instanceId] },
        });
      });
    }

    it("uses IR summaries to resolve tied option and trigger scores", () => {
      const setup = setupEngine({});
      const choose = fast ? chooseFastHeuristic : chooseHeuristic;
      const policy = createTrainingPolicy(setup.engine, 0, (window) => choose(program, window, 42));
      const view = buildBotView(setup.state, 0);
      expect(
        policy.answerDecision(view, {
          decisionId: "option",
          seat: 0,
          kind: "chooseOption",
          promptText: "Choose",
          options: {
            choices: ["Draw one", "Draw three"],
            choiceSummaries: [
              { ...empty, cardsDrawn: 1 },
              { ...empty, cardsDrawn: 3 },
            ],
          },
        }),
      ).toMatchObject({ response: { optionIndex: 1 } });
      expect(
        policy.answerDecision(view, {
          decisionId: "trigger",
          seat: 0,
          kind: "orderTriggers",
          promptText: "Order",
          options: {
            triggerKeys: ["one", "three"],
            triggerSummaries: [
              { ...empty, cardsDrawn: 1 },
              { ...empty, cardsDrawn: 3 },
            ],
          },
        }),
      ).toMatchObject({ response: { order: ["three"] } });
    });
  });
}
