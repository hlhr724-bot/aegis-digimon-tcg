import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { setupEngine } from "#api/engine/testkit/harness";

describe("Bot suspends every opponent target for up-to effects", () => {
  it("suspends both active Ravemon with Breakdramon instead of only one", () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT27-096", as: "keenan", suspended: true },
          { card: "BT27-085", as: "ravemonBurstMode" },
          { card: "BT27-083", as: "ravemon" },
        ],
      },
      1: { battleArea: [{ card: "EX13-044", as: "breakdramon" }] },
    });
    const keenan = s.perm("keenan").permanentId;
    const ravemonBurstMode = s.perm("ravemonBurstMode").permanentId;
    const ravemon = s.perm("ravemon").permanentId;
    const request: DecisionRequest = {
      decisionId: "breakdramon-suspend",
      seat: 1,
      kind: "chooseTargets",
      promptText: "Breakdramon",
      options: {
        candidateInstanceIds: [s.perm("breakdramon").permanentId, keenan, ravemonBurstMode, ravemon],
        min: 0,
        max: 2,
        targetFate: "suspend",
        effectControllerSeat: 1,
        effectTextPart: "[On Play] [When Digivolving] You may suspend up to 2 Digimon or Tamers.",
      },
    };

    const answer = createEvaluationPolicy().answerDecision(buildBotView(s.state, 1), request);

    expect(answer).toMatchObject({ type: "respondDecision", response: { kind: "chooseTargets" } });
    const chosen =
      answer.type === "respondDecision" && "instanceIds" in answer.response ? answer.response.instanceIds : [];
    expect([...chosen].sort()).toEqual([ravemonBurstMode, ravemon].sort());
  });
});
