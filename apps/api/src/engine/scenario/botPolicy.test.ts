import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared";
import { createFixtureBotPolicy } from "./botPolicy.js";
import { fixtureInstanceId } from "./references.js";

function selectCardsRequest(candidateInstanceIds: string[]): DecisionRequest {
  return {
    decisionId: "dec-1",
    seat: 1,
    kind: "selectCards",
    promptText: "Choose cards to play",
    sourceCardId: "BT26-081",
    options: { candidateInstanceIds, min: 0, max: 2 },
  } as DecisionRequest;
}

describe("fixture bot policy card selection", () => {
  const policy = createFixtureBotPolicy({
    decisions: [{ sourceCard: "BT26-081", kind: "selectCards", target: "aquilamon" }],
  })!;

  it("selects the scripted card when it is a candidate", () => {
    const aquilamon = fixtureInstanceId("aquilamon");

    expect(policy.answerDecision(undefined, selectCardsRequest(["other", aquilamon]))).toEqual({
      type: "respondDecision",
      decisionId: "dec-1",
      response: { kind: "selectCards", instanceIds: [aquilamon] },
    });
  });

  it("falls back to the evaluator when the scripted card is not offered", () => {
    expect(policy.answerDecision(undefined, selectCardsRequest(["other"]))).toEqual({
      type: "respondDecision",
      decisionId: "dec-1",
      response: { kind: "selectCards", instanceIds: [] },
    });
  });
});
