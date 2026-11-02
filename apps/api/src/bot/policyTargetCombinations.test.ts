import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { createEvaluationPolicy } from "#api/bot/policy";
import { createBaselinePolicy } from "#api/bot/baselinePolicy";
import { buildBotView } from "#api/bot/view";
import { setupEngine } from "#api/engine/testkit/harness";

describe("Bot target combinations", () => {
  it.each(["evaluation", "baseline"])(
    "%s chooses a complete legal pair instead of two incompatible candidates",
    (policyName) => {
      const s = setupEngine({
        0: {
          battleArea: [
            { card: "BT6-111", as: "alphaOne" },
            { card: "BT13-075", as: "alphaTwo" },
            { card: "BT8-069", as: "ouryu" },
          ],
        },
      });
      const first = s.perm("alphaOne").permanentId;
      const second = s.perm("alphaTwo").permanentId;
      const partner = s.perm("ouryu").permanentId;
      const allowedTargetCombinations = [
        [first, partner],
        [second, partner],
      ];
      const request: DecisionRequest = {
        decisionId: "dna-materials",
        seat: 0,
        kind: "chooseTargets",
        promptText: "DNA materials",
        options: {
          candidateInstanceIds: [first, second, partner],
          allowedTargetCombinations,
          min: 0,
          max: 2,
          purpose: "acceptedOptional",
        },
      };
      const policy = policyName === "evaluation" ? createEvaluationPolicy() : createBaselinePolicy();
      expect(
        allowedTargetCombinations.map((instanceIds) => ({
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseTargets", instanceIds },
        })),
      ).toContainEqual(policy.answerDecision(buildBotView(s.state, 0), request));
      expect(policy.answerDecision(undefined, request)).toEqual({
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "chooseTargets", instanceIds: [first, partner] },
      });
    },
  );
});
