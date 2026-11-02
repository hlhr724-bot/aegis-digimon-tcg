import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import { explainDecisionAnswer } from "#api/bot/decisions/explainDecisionAnswer";
import { explainEvadeResponse } from "#api/bot/decisions/explainEvadeResponse";
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

function buildOptional(options: DecisionRequest["options"]): DecisionRequest {
  return { decisionId: "optional", seat: 0, kind: "optional", promptText: "Use this effect?", options };
}

describe("optional effect decisions", () => {
  it("accepts an uncertain effect when its known part draws a card", () => {
    const answer = explainDecisionAnswer({
      view: buildView(),
      request: buildOptional({ effectSummary: { ...empty, cardsDrawn: 1, uncertain: true } }),
      profile,
    });
    expect(answer).toMatchObject({ intent: { response: { accept: true } }, basis: DecisionBasis.SCORED.value });
  });

  it("declines an uncertain effect when its known memory cost outweighs its known benefit", () => {
    const answer = explainDecisionAnswer({
      view: buildView(),
      request: buildOptional({ effectSummary: { ...empty, memoryCost: { minimum: 4, maximum: 4 }, uncertain: true } }),
      profile,
    });
    expect(answer).toMatchObject({ intent: { response: { accept: false } }, basis: DecisionBasis.SCORED.value });
  });

  it("accepts a free effect with no scored outcome under the explicit free-effect rule", () => {
    const answer = explainDecisionAnswer({
      view: buildView(),
      request: buildOptional({ effectSummary: { ...empty, uncertain: true } }),
      profile,
    });
    expect(answer).toMatchObject({ intent: { response: { accept: true } }, basis: DecisionBasis.FREE_EFFECT.value });
  });

  it("accepts a prompt the engine marks as preventing its own Digimon's removal", () => {
    const answer = explainDecisionAnswer({
      view: buildView(),
      request: buildOptional({ selectionGoal: DecisionSelectionGoal.PROTECT.value }),
      profile,
    });
    expect(answer).toMatchObject({ intent: { response: { accept: true } }, basis: DecisionBasis.PROTECTION.value });
  });

  it("scores Blitz as an attack on the opponent", () => {
    const attacker = buildUnit({ permanentId: "blitzer", cardId: "BT1-084" });
    const answer = explainDecisionAnswer({
      view: buildView({ board: [attacker] }),
      request: { ...buildOptional({ promptKey: "activateBlitz" }), sourcePermanentId: "blitzer" },
      profile,
    });
    expect(answer).toMatchObject({ intent: { response: { accept: true } }, basis: DecisionBasis.SCORED.value });
  });

  it("evades a deletion because keeping the Digimon outweighs a printed On Deletion payoff it lacks", () => {
    const defender = buildUnit({ permanentId: "defender", cardId: "BT1-084" });
    expect(explainEvadeResponse({ view: buildView({ board: [defender] }), permanentId: "defender", profile })).toEqual({
      intent: { type: "respondEvade", permanentId: "defender", accept: true },
      basis: DecisionBasis.SCORED.value,
    });
  });
});
