import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/bot-selects-distinct-evolution-sources.fixture";

describe("Bot distinct card selection", () => {
  it("ranks public selection costs when the bot view is unavailable", () => {
    const s = setupScenario(fixture);
    const aliases = ["copyA", "copyB", "copyC", "andromon", "metalTyrannomon"];
    const request: DecisionRequest = {
      decisionId: "unobserved-source-materials",
      seat: 1,
      kind: "selectCards",
      promptText: "Choose cards to pay a cost",
      options: {
        candidateInstanceIds: [...aliases].reverse().map((alias) => s.inst(alias).instanceId),
        visibleCards: aliases.map((alias) => ({
          instanceId: s.inst(alias).instanceId,
          cardId: s.inst(alias).cardId,
        })),
        purpose: "cost",
        min: 1,
        max: 1,
      },
    };
    expect(createEvaluationPolicy().answerDecision(undefined, request)).toEqual({
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("copyA").instanceId] },
    });
  });

  it("breaks equal public card-order values by stable identity when the bot view is unavailable", () => {
    const s = setupScenario(fixture);
    const copies = ["copyA", "copyB", "copyC"];
    const aliases = [...copies, "andromon", "metalTyrannomon"];
    const candidateInstanceIds = aliases.map((alias) => s.inst(alias).instanceId).reverse();
    const request: DecisionRequest = {
      decisionId: "unobserved-card-order",
      seat: 1,
      kind: "orderCards",
      promptText: "Order visible cards",
      options: {
        candidateInstanceIds,
        visibleCards: aliases.map((alias) => ({
          instanceId: s.inst(alias).instanceId,
          cardId: s.inst(alias).cardId,
        })),
      },
    };
    const intent = createEvaluationPolicy().answerDecision(undefined, request);
    if (intent.type !== "respondDecision" || intent.response.kind !== "orderCards") {
      throw new Error("Expected a card-order response");
    }
    expect(
      intent.response.order.filter((instanceId) => copies.some((alias) => s.inst(alias).instanceId === instanceId)),
    ).toEqual(copies.map((alias) => s.inst(alias).instanceId).sort((left, right) => left.localeCompare(right)));
  });

  it.each([true, false])(
    "preserves ranked duplicate copies only when distinctness is not required: %s",
    (distinctCardIds) => {
      const s = setupScenario(fixture);
      const aliases = ["copyA", "copyB", "copyC", "andromon", "metalTyrannomon"];
      const request: DecisionRequest = {
        decisionId: "source-materials",
        seat: 1,
        kind: "selectCards",
        promptText: "Place digivolution cards",
        options: {
          candidateInstanceIds: aliases.map((alias) => s.inst(alias).instanceId),
          visibleCards: aliases.map((alias) => ({
            instanceId: s.inst(alias).instanceId,
            cardId: s.inst(alias).cardId,
          })),
          distinctCardIds,
          purpose: "cost",
          min: 0,
          max: 3,
        },
      };
      expect(createEvaluationPolicy().answerDecision(buildBotView(s.state, 1), request)).toEqual({
        type: "respondDecision",
        decisionId: request.decisionId,
        response: {
          kind: "selectCards",
          instanceIds: (distinctCardIds ? ["copyA", "metalTyrannomon", "andromon"] : ["copyA", "copyB", "copyC"]).map(
            (alias) => s.inst(alias).instanceId,
          ),
        },
      });
    },
  );
});
