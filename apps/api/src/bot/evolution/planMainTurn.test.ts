import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { applyPlannedAction } from "#api/bot/evolution/applyPlannedAction";
import { createPlannedTurnState } from "#api/bot/evolution/createPlannedTurnState";
import { createTurnPlannerChooser } from "#api/bot/evolution/createTurnPlannerChooser";
import type { TurnPlannerParameters } from "#api/bot/evolution/defaultTurnPlannerParameters";
import { chooseHeuristic, type Feature, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { planMainTurn } from "#api/bot/evolution/planMainTurn";
import type { TrainingAction } from "#api/bot/training/actions";
import { OBSERVED_STATUS_FIELDS, type ObservedCard, type ObservedPermanent } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";

const parameters: TurnPlannerParameters = {
  depth: 3,
  beam: 6,
  weights: {
    memoryGiven: -0.5,
    opponentSecurity: 0,
    ownHand: 0,
    ownBoardDp: 0,
    ownBoardLevels: 0,
    opponentBoardDp: 0,
    win: 20,
  },
};

function program(weights: Partial<Record<Feature, number>>): HeuristicProgram {
  return {
    schemaVersion: 1,
    title: "Planner test weights",
    rules: Object.entries(weights).map(([feature, weight]) => ({
      feature: feature as Feature,
      weight,
      advice: `Weight ${feature}.`,
      when: { kind: "main" },
    })),
  };
}

function card(instanceId: string, cardId: string): ObservedCard {
  const definition = getCardDefinition(cardId)!;
  return {
    instanceId,
    cardId,
    faceUp: true,
    level: definition.level,
    dp: definition.dp,
    playCost: definition.playCost,
    colors: [...definition.colors],
    names: [],
    kinds: [...definition.kinds],
  };
}

function unit(permanentId: string, top: ObservedCard, options: Partial<ObservedPermanent> = {}): ObservedPermanent {
  return {
    permanentId,
    top,
    stack: [],
    linked: [],
    dp: top.dp ?? 0,
    suspended: false,
    keywords: [],
    statuses: Object.fromEntries(
      OBSERVED_STATUS_FIELDS.map((field) => [field, false]),
    ) as ObservedPermanent["statuses"],
    securityAttack: 1,
    inBreeding: false,
    enteredThisTurn: false,
    canAttackPlayer: false,
    attackablePermanentIds: [],
    activatableEffectsJson: "[]",
    ...options,
  };
}

function window(input: {
  memory: number;
  hand: ObservedCard[];
  board: ObservedPermanent[];
  enemyBoard?: ObservedPermanent[];
  enemySecurity?: number;
  actions: TrainingAction[];
}): TrainingWindow {
  return {
    observation: {
      schemaVersion: 4,
      seat: 0,
      turnSeat: 0,
      turn: 5,
      phase: "main",
      memory: input.memory,
      players: [
        {
          seat: 0,
          handCount: input.hand.length,
          deckCount: 30,
          eggDeckCount: 4,
          securityCount: 5,
          hand: input.hand,
          trash: [],
          delay: [],
          faceUpSecurity: [],
          board: input.board,
        },
        {
          seat: 1,
          handCount: 5,
          deckCount: 30,
          eggDeckCount: 4,
          securityCount: input.enemySecurity ?? 5,
          hand: [],
          trash: [],
          delay: [],
          faceUpSecurity: [],
          board: input.enemyBoard ?? [],
        },
      ],
      revealed: [],
      history: { seenCardIds: [], knownCards: [], recent: [] },
    },
    kind: "main",
    selected: [],
    actions: [{ intent: { type: "endPhase" }, label: "End main phase" }, ...input.actions],
  };
}

function play(instanceId: string, cost: number): TrainingAction {
  return {
    intent: { type: "playCard", instanceId },
    label: "Play or use card",
    sourceId: instanceId,
    projectedCost: cost,
  };
}

function digivolve(instanceId: string, permanentId: string, cost: number): TrainingAction {
  return {
    intent: { type: "digivolve", instanceId, permanentId },
    label: "Digivolve",
    sourceId: instanceId,
    targetId: permanentId,
    projectedCost: cost,
  };
}

function attack(attackerPermanentId: string, permanentId?: string): TrainingAction {
  return {
    intent: {
      type: "attack",
      attackerPermanentId,
      target: permanentId === undefined ? { kind: "player" } : { kind: "permanent", permanentId },
    },
    label: permanentId === undefined ? "Attack player" : "Attack Digimon",
    sourceId: attackerPermanentId,
    ...(permanentId === undefined ? {} : { targetId: permanentId }),
  };
}

describe("main-phase turn planner", () => {
  it("spends memory on two cheaper plays instead of ending the turn on one expensive play", () => {
    const turn = window({
      memory: 4,
      hand: [card("large", "BT1-019"), card("first", "BT1-014"), card("second", "BT1-015")],
      board: [],
      actions: [play("large", 5), play("first", 2), play("second", 2)],
    });
    const weights = program({ playBody: 1, handover: -1 });
    expect(turn.actions[chooseHeuristic(weights, turn)]!.sourceId).toBe("large");
    const plan = planMainTurn({ program: weights, window: turn, parameters });
    expect(turn.actions[plan.index]!.sourceId).not.toBe("large");
    expect(plan.sequence.length).toBeGreaterThanOrEqual(2);
  });

  it("plans a two-step digivolution before spending memory on a play", () => {
    const turn = window({
      memory: 4,
      hand: [card("champion", "BT1-014"), card("ultimate", "BT1-020"), card("rookie", "BT1-013")],
      board: [unit("partner", card("partner-top", "BT1-010"))],
      actions: [digivolve("champion", "partner", 2), play("champion", 3), play("rookie", 3)],
    });
    const weights = program({ digivolve: 1, dpGain: 1, playBody: 0.7 });
    expect(turn.actions[chooseHeuristic(weights, turn)]!.sourceId).toBe("rookie");
    const plan = planMainTurn({ program: weights, window: turn, parameters });
    expect(turn.actions[plan.index]!.intent).toEqual({
      type: "digivolve",
      instanceId: "champion",
      permanentId: "partner",
    });
  });

  it("offers the printed follow-up digivolution after a planned digivolution", () => {
    const turn = window({
      memory: 4,
      hand: [card("champion", "BT1-014"), card("ultimate", "BT1-020")],
      board: [unit("partner", card("partner-top", "BT1-010"))],
      actions: [digivolve("champion", "partner", 2)],
    });
    const next = applyPlannedAction(createPlannedTurnState(turn), 1);
    expect(next.observation.memory).toBe(2);
    expect(next.observation.players[0]!.handCount).toBe(2);
    expect(next.observation.players[0]!.board[0]!.dp).toBe(4000);
    expect(next.actions.map((action) => action.intent)).toContainEqual({
      type: "digivolve",
      instanceId: "ultimate",
      permanentId: "partner",
    });
  });

  it("ends the planned turn when a cost crosses the memory gauge", () => {
    const turn = window({
      memory: 1,
      hand: [card("large", "BT1-019")],
      board: [],
      actions: [play("large", 4)],
    });
    const next = applyPlannedAction(createPlannedTurnState(turn), 1);
    expect(next.ended).toBe(true);
    expect(next.memoryGiven).toBe(3);
  });

  it("removes a defeated defender and every attack that targeted it", () => {
    const turn = window({
      memory: 3,
      hand: [],
      board: [
        unit("strong", card("strong-top", "BT1-019"), { canAttackPlayer: true, attackablePermanentIds: ["weak"] }),
        unit("other", card("other-top", "BT1-014"), { canAttackPlayer: true, attackablePermanentIds: ["weak"] }),
      ],
      enemyBoard: [unit("weak", card("weak-top", "BT1-010"), { suspended: true })],
      actions: [attack("strong", "weak"), attack("other", "weak"), attack("other")],
    });
    const next = applyPlannedAction(createPlannedTurnState(turn), 1);
    expect(next.observation.players[1]!.board).toEqual([]);
    expect(next.actions.map((action) => action.intent)).toEqual([turn.actions[0]!.intent, attack("other").intent]);
  });

  it("takes a lethal attack that the one-step weights rank below developing", () => {
    const turn = window({
      memory: 3,
      hand: [card("rookie", "BT1-013")],
      board: [unit("striker", card("striker-top", "BT1-019"), { canAttackPlayer: true })],
      enemySecurity: 0,
      actions: [play("rookie", 5), attack("striker")],
    });
    const weights = program({ playBody: 1, attackPlayer: 0.5 });
    expect(turn.actions[chooseHeuristic(weights, turn)]!.label).toBe("Play or use card");
    const plan = planMainTurn({ program: weights, window: turn, parameters: { ...parameters, depth: 1 } });
    expect(turn.actions[plan.index]!.label).toBe("Attack player");
  });

  it("leaves non-main decisions to the underlying heuristic", () => {
    const weights = program({ playBody: 1 });
    const turn = { ...window({ memory: 4, hand: [], board: [], actions: [] }), kind: "selectCards" };
    const choose = createTurnPlannerChooser({ program: weights, seed: 9 });
    expect(choose(turn)).toBe(chooseHeuristic(weights, turn, 9));
  });

  it("returns the same plan for the same window", () => {
    const turn = window({
      memory: 4,
      hand: [card("champion", "BT1-014"), card("ultimate", "BT1-020"), card("rookie", "BT1-013")],
      board: [unit("partner", card("partner-top", "BT1-010"))],
      actions: [digivolve("champion", "partner", 2), play("rookie", 3), play("ultimate", 5)],
    });
    const weights = program({ digivolve: 1, dpGain: 1, playBody: 0.7 });
    expect(planMainTurn({ program: weights, window: turn, parameters })).toEqual(
      planMainTurn({ program: weights, window: turn, parameters }),
    );
  });
});
