import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import { explainDecisionAnswer } from "#api/bot/decisions/explainDecisionAnswer";
import { BOT_PROFILES } from "#api/bot/profiles";
import type { BotUnit, BotView } from "#api/bot/view";

const profile = BOT_PROFILES.balanced;

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

function buildUnit(overrides: Partial<BotUnit> & { permanentId: string; cardId: string }): BotUnit {
  const definition = getCardDefinition(overrides.cardId);
  return {
    topCardInstanceId: `${overrides.permanentId}-top`,
    definition,
    dp: definition?.dp ?? 0,
    level: definition?.level ?? 0,
    suspended: false,
    inBreeding: false,
    cannotDigivolve: false,
    keywords: [],
    canAttackPlayer: false,
    attackablePermanentIds: [],
    activatableEffects: [],
    ...overrides,
  };
}

function buildView(overrides: Partial<BotView> = {}): BotView {
  return {
    seat: 0 as Seat,
    opponentSeat: 1 as Seat,
    phase: Phase.Main,
    turnSeat: 0 as Seat,
    gameOver: false,
    memory: 2,
    maxAffordable: 12,
    freeMemory: 2,
    hand: [],
    board: [],
    opponentBoard: [],
    securityCount: 4,
    opponentSecurityCount: 4,
    deckCount: 30,
    eggDeckCount: 0,
    trashCount: 0,
    readyAttackers: [],
    ownFieldColors: new Set(["Red"]),
    ...overrides,
  };
}

function answer(view: BotView, request: DecisionRequest) {
  return explainDecisionAnswer({ view, request, profile });
}

function buildSelection(
  kind: "selectCards" | "chooseTargets",
  options: NonNullable<DecisionRequest["options"]>,
): DecisionRequest {
  return { decisionId: kind, seat: 0, kind, promptText: "Select", options };
}

const uncertain: DecisionEffectSummary = { ...empty, uncertain: true };

function reversedTwice<Value>(values: readonly Value[]): Value[][] {
  return [[...values], [...values].reverse()];
}

describe("residual fixed-default decisions", () => {
  it("resolves a printed When Attacking effect before one another card granted", () => {
    const printed = "gabumon::BT6-030/ir-12-1";
    const granted = "gabumon::subtrigger/whenAttacking~perm-5~~trident%2FBT6-096%2Fir-25-0%2F2/whenAttacking";
    const view = buildView({ board: [buildUnit({ permanentId: "perm-5", cardId: "BT6-030" })] });
    for (const triggerKeys of reversedTwice([printed, granted])) {
      const request: DecisionRequest = {
        decisionId: "order",
        seat: 0,
        kind: "orderTriggers",
        promptText: "Order",
        options: {
          triggerKeys,
          triggerCardIds: ["BT6-030", "BT6-030"],
          triggerSummaries: [uncertain, uncertain],
          triggerControllerSeats: [0, 0],
          triggerIsInherited: [false, false],
        },
      };
      expect(answer(view, request).intent).toMatchObject({ response: { kind: "orderTriggers", order: [printed] } });
    }
  });

  it("scores an effect-granted attack prompt by the best ready attacker", () => {
    const request: DecisionRequest = {
      decisionId: "attack",
      seat: 0,
      kind: "optional",
      promptText: "Attack with a Digimon",
      options: {
        effectSummary: { ...uncertain, memoryCost: { minimum: 0, maximum: null } },
        effectControllerSeat: 0,
        selectionContext: "attackSource",
      },
    };
    const ready = buildView({
      board: [buildUnit({ permanentId: "greymon", cardId: "BT9-016" })],
      opponentSecurityCount: 1,
    });
    expect(answer(ready, request)).toMatchObject({
      intent: { response: { kind: "optional", accept: true } },
      basis: DecisionBasis.SCORED.value,
    });
    const resting = buildView({ board: [buildUnit({ permanentId: "greymon", cardId: "BT9-016", suspended: true })] });
    expect(answer(resting, request).basis).toBe(DecisionBasis.UNSCORED_OPTIONAL.value);
  });

  it("places a source from under a Tamer before a hand copy and prefers the card the effect names", () => {
    const view = buildView({
      hand: [
        {
          instanceId: "handDecker",
          cardId: "BT10-020",
          definition: getCardDefinition("BT10-020"),
          activatableEffects: [],
        },
      ],
    });
    const cards = [
      { instanceId: "handDecker", cardId: "BT10-020" },
      { instanceId: "tamerDecker", cardId: "BT10-020" },
      { instanceId: "tamerMail", cardId: "BT10-021" },
    ];
    for (const ordered of reversedTwice(cards)) {
      const request = buildSelection("selectCards", {
        candidateInstanceIds: ordered.map((card) => card.instanceId),
        visibleCards: ordered,
        min: 0,
        max: 1,
        purpose: "acceptedOptional",
        effectControllerSeat: 0,
        effectSummary: uncertain,
        effectText:
          "[On Play][When Digivolving] You may place 1 Digimon card with [Blue Flare] in its traits from your hand or from under one of your Tamers under this Digimon as its bottom digivolution card. Then, if [Deckerdramon] is in this Digimon's digivolution cards, 1 of your opponent's Digimon can't attack or block until the end of your opponent's turn.",
      });
      expect(answer(view, request).intent).toMatchObject({
        response: { kind: "selectCards", instanceIds: ["tamerDecker"] },
      });
    }
  });
  it("treats interchangeable vanilla opposing Digimon as one target", () => {
    const view = buildView({
      opponentBoard: [
        buildUnit({ permanentId: "monodramon", cardId: "BT1-009" }),
        buildUnit({ permanentId: "biyomon", cardId: "ST1-02" }),
      ],
    });
    for (const candidateInstanceIds of reversedTwice(["monodramon", "biyomon"])) {
      const request = buildSelection("chooseTargets", {
        candidateInstanceIds,
        min: 1,
        max: 1,
        effectControllerSeat: 0,
      });
      expect(answer(view, request).intent).toMatchObject({
        response: { kind: "chooseTargets", instanceIds: ["biyomon"] },
      });
    }
  });
  it("scores a discard whose follow-up returns a card from the trash", () => {
    const hand = ["BT3-077", "ST6-03", "BT4-111", "BT5-087"].map((cardId, index) => ({
      instanceId: `card-${index}`,
      cardId,
      definition: getCardDefinition(cardId),
      activatableEffects: [],
    }));
    const view = buildView({ hand });
    for (const ordered of reversedTwice(hand)) {
      const request = buildSelection("selectCards", {
        candidateInstanceIds: ordered.map((card) => card.instanceId),
        visibleCards: ordered.map(({ instanceId, cardId }) => ({ instanceId, cardId })),
        min: 0,
        max: 1,
        selectionGoal: DecisionSelectionGoal.DISCARD.value,
        effectControllerSeat: 0,
        effectSummary: uncertain,
        effectText:
          "[On Play] You may trash 1 card in your hand. If you do, return 1 Digimon card with [Seven Great Demon Lords] or [Three Musketeers] in its type from your trash to your hand.",
      });
      expect(answer(view, request).basis).toBe(DecisionBasis.SCORED.value);
    }
  });
  it("ignores opposing turn-scoped keywords on the bot's turn", () => {
    const view = buildView({
      opponentBoard: [
        buildUnit({ permanentId: "rush", cardId: "BT10-111", keywords: ["MaterialSave", "Rush"] }),
        buildUnit({ permanentId: "substitute", cardId: "BT10-111", keywords: ["MaterialSave", "DigiXrosSubstitute"] }),
      ],
    });
    for (const candidateInstanceIds of reversedTwice(["rush", "substitute"])) {
      const request = buildSelection("chooseTargets", {
        candidateInstanceIds,
        min: 1,
        max: 1,
        effectControllerSeat: 0,
      });
      expect(answer(view, request).intent).toMatchObject({
        response: { kind: "chooseTargets", instanceIds: ["rush"] },
      });
    }
  });
  it("prefers a ready opposing Rush Digimon during its controller's turn", () => {
    const view = buildView({
      turnSeat: 1 as Seat,
      opponentBoard: [
        buildUnit({ permanentId: "substitute", cardId: "BT10-111", keywords: ["MaterialSave", "DigiXrosSubstitute"] }),
        buildUnit({ permanentId: "rush", cardId: "BT10-111", keywords: ["MaterialSave", "Rush"] }),
      ],
    });
    for (const candidateInstanceIds of reversedTwice(["substitute", "rush"])) {
      const request = buildSelection("chooseTargets", {
        candidateInstanceIds,
        min: 1,
        max: 1,
        effectControllerSeat: 0,
      });
      expect(answer(view, request).intent).toMatchObject({
        response: { kind: "chooseTargets", instanceIds: ["rush"] },
      });
    }
  });
});
