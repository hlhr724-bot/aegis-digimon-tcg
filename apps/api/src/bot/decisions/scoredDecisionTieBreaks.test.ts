import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { chooseCounterAction } from "#api/bot/decisions/chooseCounterAction";
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

describe("card selection tie-breaks", () => {
  it("removes the ready copy of two otherwise identical opposing Digimon", () => {
    const view = buildView({
      opponentBoard: [
        buildUnit({ permanentId: "resting", cardId: "BT1-084", suspended: true }),
        buildUnit({ permanentId: "ready", cardId: "BT1-084" }),
      ],
    });
    for (const candidateInstanceIds of [
      ["resting", "ready"],
      ["ready", "resting"],
    ]) {
      expect(
        answer(view, buildSelection("chooseTargets", { candidateInstanceIds, min: 1, max: 1, targetFate: "delete" })),
      ).toMatchObject({ intent: { response: { instanceIds: ["ready"] } }, basis: DecisionBasis.SCORED.value });
    }
  });

  it("pays a cost with the trash copy before the identical hand card", () => {
    const view = buildView({
      hand: [
        {
          instanceId: "hand-copy",
          cardId: "BT1-010",
          definition: getCardDefinition("BT1-010"),
          activatableEffects: [],
        },
      ],
    });
    const request = buildSelection("selectCards", {
      purpose: "cost",
      min: 1,
      max: 1,
      candidateInstanceIds: ["hand-copy", "trash-copy"],
      visibleCards: [{ instanceId: "trash-copy", cardId: "BT1-010" }],
    });
    expect(answer(view, request)).toMatchObject({ intent: { response: { instanceIds: ["trash-copy"] } } });
  });

  it("ranks an opposing Tamer by its play cost instead of its zero DP", () => {
    const view = buildView({
      opponentBoard: [
        buildUnit({ permanentId: "weak", cardId: "BT1-009", dp: 1000 }),
        buildUnit({ permanentId: "tamer", cardId: "BT1-085" }),
      ],
    });
    expect(
      answer(view, buildSelection("chooseTargets", { candidateInstanceIds: ["weak", "tamer"], min: 1, max: 1 })),
    ).toMatchObject({ intent: { response: { instanceIds: ["tamer"] } } });
  });

  it("sacrifices another Digimon to protect one only when the protected Digimon is worth more", () => {
    const small = buildUnit({ permanentId: "small", cardId: "BT1-009" });
    const large = buildUnit({ permanentId: "large", cardId: "BT1-084" });
    const view = buildView({ board: [small, large] });
    const protect = (saved: BotUnit, sacrifice: BotUnit): DecisionRequest => ({
      ...buildSelection("selectCards", {
        selectionGoal: DecisionSelectionGoal.PROTECT.value,
        candidateInstanceIds: [sacrifice.topCardInstanceId!],
        min: 0,
        max: 1,
      }),
      sourcePermanentId: saved.permanentId,
    });
    expect(answer(view, protect(small, large))).toMatchObject({
      intent: { response: { instanceIds: [] } },
      basis: DecisionBasis.PROTECTION.value,
    });
    expect(answer(view, protect(large, small))).toMatchObject({
      intent: { response: { instanceIds: [small.topCardInstanceId] } },
      basis: DecisionBasis.PROTECTION.value,
    });
  });
});

describe("ordering and option tie-breaks", () => {
  it("places the weakest digivolution card at the bottom of the stack", () => {
    const options = {
      candidateInstanceIds: ["strong", "weak"],
      visibleCards: [
        { instanceId: "strong", cardId: "BT1-084" },
        { instanceId: "weak", cardId: "BT1-010" },
      ],
    };
    const order = (orderDestination: "stackBottom" | "deckTop") =>
      answer(buildView(), {
        decisionId: "order",
        seat: 0,
        kind: "orderCards",
        promptText: "Order",
        options: { ...options, orderDestination },
      }).intent;
    expect(order("stackBottom")).toMatchObject({ response: { order: ["weak", "strong"] } });
    expect(order("deckTop")).toMatchObject({ response: { order: ["strong", "weak"] } });
  });

  it("chooses the full De-Digivolve amount when the effect removes the opponent's cards", () => {
    const request = (removal: number): DecisionRequest => ({
      decisionId: "amount",
      seat: 0,
      kind: "chooseOption",
      promptText: "De-Digivolve",
      options: { choices: ["1 card", "2 cards"], effectControllerSeat: 0, effectSummary: { ...empty, removal } },
    });
    expect(answer(buildView(), request(1)).intent).toMatchObject({ response: { optionIndex: 1 } });
    expect(answer(buildView(), request(0)).intent).toMatchObject({ response: { optionIndex: 0 } });
  });

  it("puts a weaker opposing Digimon on top of its owner's security and buries a stronger one", () => {
    const attacker = buildUnit({ permanentId: "attacker", cardId: "BT1-009", dp: 6000 });
    const placement = (dp: number) => {
      const placed = buildUnit({ permanentId: "placed", cardId: "BT1-084", dp });
      return answer(buildView({ board: [attacker], opponentBoard: [placed] }), {
        decisionId: "security",
        seat: 0,
        kind: "chooseOption",
        promptText: "Chaos Degradation",
        options: { choices: ["Top of security", "Bottom of security"], affectedPermanentIds: ["placed"] },
      }).intent;
    };
    expect(placement(2000)).toMatchObject({ response: { optionIndex: 0 } });
    expect(placement(12000)).toMatchObject({ response: { optionIndex: 1 } });
  });

  it("resolves a printed effect before an inherited effect with the same score", () => {
    for (const reversed of [false, true]) {
      const keys = reversed ? ["printed", "inherited"] : ["inherited", "printed"];
      expect(
        answer(buildView(), {
          decisionId: "triggers",
          seat: 0,
          kind: "orderTriggers",
          promptText: "Order",
          options: {
            triggerKeys: keys,
            triggerCardIds: ["BT1-010", "BT1-010"],
            triggerIsInherited: keys.map((key) => key === "inherited"),
          },
        }).intent,
      ).toMatchObject({ response: { order: ["printed"] } });
    }
  });
});

describe("counter decisions", () => {
  it("scores Blast DNA by the resulting body instead of a flat activation weight", () => {
    const base = buildUnit({ permanentId: "base", cardId: "BT1-009" });
    const view = buildView({ board: [base] });
    const blastKey = `blast-dna-digivolve:${JSON.stringify(["base", "base-top", "hand-material", 0])}`;
    const result = chooseCounterAction({
      view,
      profile,
      context: {
        kind: "counterWindowOpened",
        defendingSeat: 0,
        attackerPermanentId: "attacker",
        eligibleCounters: [
          { instanceId: "free", effectKey: "free", description: "Free", summary: empty },
          { instanceId: "result", effectKey: blastKey, description: "Blast DNA", sourceCardId: "BT1-084" },
        ],
      },
    });
    expect(result).toEqual({
      intent: { type: "respondCounter", sourceInstanceId: "result", effectKey: blastKey },
      basis: DecisionBasis.SCORED.value,
    });
  });
});
