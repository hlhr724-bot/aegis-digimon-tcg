import { describe, expect, it } from "vitest";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { setupEngine } from "#api/engine/testkit/harness";

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

function prepareDecision() {
  const setup = setupEngine(
    {
      0: {
        hand: [
          { card: "BT1-010", as: "small" },
          { card: "BT1-023", as: "large" },
        ],
        trash: [
          { card: "BT1-010", as: "recoverSmall" },
          { card: "BT1-023", as: "recoverLarge" },
        ],
        battleArea: [{ card: "BT1-015", as: "own" }],
        security: 1,
      },
      1: {
        battleArea: [
          { card: "BT1-010", as: "enemySmall" },
          { card: "BT1-023", as: "enemyLarge" },
        ],
      },
    },
    { fixtureIds: true },
  );
  return { setup, view: buildBotView(setup.state, 0), policy: createEvaluationPolicy() };
}

describe("scored effect decisions", () => {
  it("chooses useful recovery over an earlier draw when security is critical", () => {
    const { policy, view } = prepareDecision();
    expect(
      policy.answerDecision(view, {
        decisionId: "modal",
        seat: 0,
        kind: "chooseOption",
        promptText: "Choose",
        options: {
          choices: ["Draw", "Recover"],
          choiceSummaries: [
            { ...empty, cardsDrawn: 1 },
            { ...empty, cardsRecovered: 1 },
          ],
        },
      }),
    ).toMatchObject({ response: { kind: "chooseOption", optionIndex: 1 } });
  });

  it("pays the cheapest offered digivolution requirement after the cost delta", () => {
    const { policy, view } = prepareDecision();
    expect(
      policy.answerDecision(view, {
        decisionId: "evolve",
        seat: 0,
        kind: "chooseOption",
        promptText: "Choose cost",
        options: {
          choices: ["First", "Second"],
          digivolveCostChoice: { fromCardId: "BT1-010", intoCardId: "BT1-015", costs: [4, 2], costDelta: -1 },
        },
      }),
    ).toMatchObject({ response: { optionIndex: 1 } });
  });

  it("orders a useful effect before removal with no legal opposing body", () => {
    const { policy, view } = prepareDecision();
    if (view === undefined) {
      throw new Error("Expected seated view");
    }
    expect(
      policy.answerDecision(
        { ...view, opponentBoard: [] },
        {
          decisionId: "trigger",
          seat: 0,
          kind: "orderTriggers",
          promptText: "Order",
          options: {
            triggerKeys: ["removal", "draw"],
            triggerSummaries: [
              { ...empty, removal: 1 },
              { ...empty, cardsDrawn: 1 },
            ],
          },
        },
      ),
    ).toMatchObject({ response: { order: ["draw"] } });
  });

  it("minimizes the benefit when asked to select an opposing controller's option", () => {
    const { policy, view } = prepareDecision();
    expect(
      policy.answerDecision(view, {
        decisionId: "opponent-modal",
        seat: 0,
        kind: "chooseOption",
        promptText: "Choose opponent benefit",
        options: {
          choices: ["Draw three", "Draw one"],
          effectControllerSeat: 1,
          choiceSummaries: [
            { ...empty, cardsDrawn: 3 },
            { ...empty, cardsDrawn: 1 },
          ],
        },
      }),
    ).toMatchObject({ response: { optionIndex: 1 } });
  });

  it("ranks revealed cards for recovery using the explicit selection goal", () => {
    const { policy, setup, view } = prepareDecision();
    const cards = [setup.inst("recoverSmall"), setup.inst("recoverLarge")];
    expect(
      policy.answerDecision(view, {
        decisionId: "recover",
        seat: 0,
        kind: "selectCards",
        promptText: "Recover a card",
        options: {
          selectionGoal: DecisionSelectionGoal.GAIN.value,
          min: 0,
          max: 1,
          candidateInstanceIds: cards.map((card) => card.instanceId),
          visibleCards: cards.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
        },
      }),
    ).toMatchObject({ response: { instanceIds: [setup.inst("recoverLarge").instanceId] } });
  });

  it("spends the cheaper hand card for an explicit self cost", () => {
    const { policy, setup, view } = prepareDecision();
    expect(
      policy.answerDecision(view, {
        decisionId: "cost",
        seat: 0,
        kind: "selectCards",
        promptText: "Pay",
        options: {
          purpose: "cost",
          min: 0,
          max: 1,
          candidateInstanceIds: [setup.inst("large").instanceId, setup.inst("small").instanceId],
        },
      }),
    ).toMatchObject({ response: { instanceIds: [setup.inst("small").instanceId] } });
  });

  it("places a higher-value visible card before a weaker card in a deck order", () => {
    const { policy, setup, view } = prepareDecision();
    const cards = [setup.inst("recoverSmall"), setup.inst("recoverLarge")];
    expect(
      policy.answerDecision(view, {
        decisionId: "order",
        seat: 0,
        kind: "orderCards",
        promptText: "Order cards",
        options: {
          orderDestination: "deckTop",
          candidateInstanceIds: cards.map((card) => card.instanceId),
          visibleCards: cards.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
        },
      }),
    ).toMatchObject({
      response: { order: [setup.inst("recoverLarge").instanceId, setup.inst("recoverSmall").instanceId] },
    });
  });

  it("declines a known net-cost optional effect but preserves an uncertain effect", () => {
    const { policy, view } = prepareDecision();
    expect(
      policy.answerDecision(view, {
        decisionId: "empty",
        seat: 0,
        kind: "optional",
        promptText: "Use",
        options: { effectSummary: { ...empty, memoryCost: { minimum: 3, maximum: 3 } } },
      }),
    ).toMatchObject({ response: { accept: false } });
    expect(
      policy.answerDecision(view, {
        decisionId: "unknown",
        seat: 0,
        kind: "optional",
        promptText: "Use",
        options: { effectSummary: { ...empty, uncertain: true } },
      }),
    ).toMatchObject({ response: { accept: true } });
  });
});

it("selects a stronger Counter effect instead of the first eligible source", () => {
  const { policy, view } = prepareDecision();
  if (view === undefined) {
    throw new Error("Expected seated view");
  }
  const intent = policy.chooseCounterResponse(view, {
    kind: "counterWindowOpened",
    defendingSeat: 0,
    attackerPermanentId: "attacker",
    eligibleCounters: [
      { instanceId: "first", effectKey: "first", description: "Draw one", summary: { ...empty, cardsDrawn: 1 } },
      {
        instanceId: "second",
        effectKey: "second",
        description: "Recover one",
        summary: { ...empty, cardsRecovered: 1 },
      },
    ],
  });
  expect(intent).toEqual({ type: "respondCounter", sourceInstanceId: "second", effectKey: "second" });
});

it("chooses the profitable forced blocker instead of sacrificing the first offered body", () => {
  const { policy, view } = prepareDecision();
  if (view === undefined) {
    throw new Error("Expected seated view");
  }
  const original = view.board[0]!;
  const weak = { ...original, permanentId: "weak", dp: 1000 };
  const strong = { ...original, permanentId: "strong", dp: 15000 };
  const enemy = { ...original, permanentId: "attacker", dp: 10000 };
  expect(
    policy.chooseBlockResponse(
      { ...view, board: [weak, strong], opponentBoard: [enemy] },
      { attackerPermanentId: "attacker", eligibleBlockerIds: ["weak", "strong"], mustBlock: true, targetsPlayer: true },
    ),
  ).toEqual({ type: "declareBlock", blockerPermanentId: "strong" });
});
