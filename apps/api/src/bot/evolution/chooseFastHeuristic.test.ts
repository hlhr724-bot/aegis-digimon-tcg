import { describe, expect, it } from "vitest";
import { CardColor, CardKind } from "@aegis/shared/schema/enums";
import type { ObservedCard, ObservedPermanent } from "#api/bot/training/observation";
import { OBSERVED_STATUS_FIELDS } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";
import {
  actionCardId,
  actionFeatures,
  chooseHeuristic,
  FEATURES,
  scoreHeuristicRules,
  SEED_HEURISTIC,
  type HeuristicProgram,
} from "#api/bot/evolution/heuristic";
import { chooseFastHeuristic } from "#api/bot/evolution/chooseFastHeuristic";
import { createHeuristicFeatureContext } from "#api/bot/evolution/createHeuristicFeatureContext";
import { scoreFastHeuristic } from "#api/bot/evolution/scoreFastHeuristic";

function card(instanceId: string, kinds: readonly string[] = [CardKind.Digimon]): ObservedCard {
  return {
    instanceId,
    cardId: "BT1-010",
    faceUp: true,
    level: 3,
    dp: 2000,
    playCost: 3,
    colors: [CardColor.Red],
    names: ["Agumon"],
    kinds,
  };
}

function unit(permanentId: string, dp: number, inBreeding = false): ObservedPermanent {
  return {
    permanentId,
    top: card(`${permanentId}-top`),
    stack: [card(`${permanentId}-stack`)],
    linked: [card(`${permanentId}-link`)],
    dp,
    suspended: false,
    keywords: [],
    statuses: Object.fromEntries(
      OBSERVED_STATUS_FIELDS.map((field) => [field, false]),
    ) as ObservedPermanent["statuses"],
    securityAttack: 1,
    inBreeding,
    enteredThisTurn: false,
    canAttackPlayer: true,
    attackablePermanentIds: [],
    activatableEffectsJson: "[]",
  };
}

function windowFixture(): TrainingWindow {
  return {
    observation: {
      schemaVersion: 4,
      seat: 0,
      turnSeat: 0,
      turn: 7,
      phase: "main",
      memory: 2,
      players: [
        {
          seat: 0,
          handCount: 3,
          deckCount: 25,
          eggDeckCount: 3,
          securityCount: 0,
          hand: [card("body"), card("tamer", [CardKind.Tamer]), card("option", [CardKind.Option])],
          trash: [card("own-trash")],
          delay: [card("own-delay")],
          faceUpSecurity: [card("own-security")],
          board: [unit("weak", 4000), unit("strong", 9000)],
          breeding: unit("breed", 1000, true),
        },
        {
          seat: 1,
          handCount: 9,
          deckCount: 24,
          eggDeckCount: 2,
          securityCount: 0,
          hand: [],
          trash: [card("enemy-trash")],
          delay: [card("enemy-delay")],
          faceUpSecurity: [card("enemy-security")],
          board: [unit("target", 5000)],
          breeding: unit("enemy-breed", 1000, true),
        },
      ],
      revealed: [card("revealed")],
      history: { seenCardIds: ["BT1-010"], knownCards: [], recent: [] },
    },
    kind: "main",
    selected: [],
    combat: { targetsPlayer: true, mustBlock: false },
    actions: [
      { intent: { type: "endPhase" }, label: "Pass" },
      { intent: { type: "playCard", instanceId: "body" }, label: "Play", sourceId: "body", projectedCost: 4 },
      { intent: { type: "playCard", instanceId: "tamer" }, label: "Tamer", sourceId: "tamer" },
      { intent: { type: "playCard", instanceId: "option" }, label: "Option", sourceId: "option" },
      {
        intent: { type: "playCard", instanceId: "body", digiXros: { materialInstanceIds: ["weak-top"] } },
        label: "DigiXros",
        sourceId: "body",
        materialIds: ["weak-top"],
      },
      {
        intent: { type: "playCard", instanceId: "body", assembly: { materialInstanceIds: ["own-trash"] } },
        label: "Assembly",
        sourceId: "body",
      },
      {
        intent: { type: "digivolve", instanceId: "body", permanentId: "breed" },
        label: "Evolve",
        sourceId: "body",
        targetId: "breed",
      },
      {
        intent: { type: "attack", attackerPermanentId: "weak", target: { kind: "player" } },
        label: "Attack",
        sourceId: "weak",
      },
      {
        intent: { type: "attack", attackerPermanentId: "weak", target: { kind: "permanent", permanentId: "target" } },
        label: "Lose",
        sourceId: "weak",
        targetId: "target",
      },
      {
        intent: { type: "attack", attackerPermanentId: "strong", target: { kind: "permanent", permanentId: "target" } },
        label: "Win",
        sourceId: "strong-top",
        targetId: "target",
      },
      { intent: { type: "hatchEgg" }, label: "Hatch" },
      { intent: { type: "moveFromBreeding", permanentId: "breed" }, label: "Deploy", sourceId: "breed" },
      {
        intent: { type: "activateEffect", sourceInstanceId: "own-delay", effectKey: "main" },
        label: "Activate",
        sourceId: "own-delay",
      },
      {
        intent: { type: "dnaDigivolve", instanceId: "body", materialPermanentIds: ["weak", "strong"] },
        label: "DNA",
        sourceId: "body",
        materialIds: ["weak", "strong"],
      },
      {
        intent: { type: "appFusion", permanentId: "weak", instanceId: "body", linkedInstanceId: "weak-link" },
        label: "Fusion",
        sourceId: "body",
        targetId: "weak",
      },
      {
        intent: { type: "linkCard", instanceId: "body", targetPermanentId: "weak" },
        label: "Link",
        sourceId: "body",
        targetId: "weak",
      },
      { intent: { type: "declareBlock", blockerPermanentId: "weak" }, label: "Block", sourceId: "weak" },
      { intent: { type: "declineBlock" }, label: "Decline" },
      { intent: { type: "respondCounter" }, label: "Counter" },
      { intent: { type: "respondAlliance", allyPermanentId: "weak" }, label: "Alliance", sourceId: "weak" },
      ...(["respondEvade", "respondBarrier"] as const).flatMap((type) =>
        [true, false].map((accept) => ({
          intent: { type, permanentId: "weak", accept },
          label: "Defense",
          sourceId: "weak",
        })),
      ),
      ...[true, false].map((keep) => ({ intent: { type: "mulligan" as const, keep }, label: "Opening" })),
      ...[true, false].map((accept) => ({
        intent: {
          type: "respondDecision" as const,
          decisionId: "optional",
          response: { kind: "optional" as const, accept },
        },
        label: "Optional",
      })),
      {
        intent: {
          type: "respondDecision",
          decisionId: "selection",
          response: { kind: "selectCards", instanceIds: [] },
        },
        label: "Finish selection",
        sourceId: "enemy-trash",
      },
      {
        intent: { type: "respondDecision", decisionId: "assembly", response: { kind: "selectCards", instanceIds: [] } },
        label: "Finish Assembly",
        sourceId: "revealed",
      },
      ...["weak-stack", "weak-link", "own-security", "enemy-delay", "enemy-security", "enemy-breed", "missing"].map(
        (sourceId) => ({ intent: { type: "endPhase" as const }, label: sourceId, sourceId }),
      ),
    ],
  };
}

function programs(): HeuristicProgram[] {
  return [
    SEED_HEURISTIC,
    {
      schemaVersion: 1,
      title: "All features",
      rules: FEATURES.map((feature, index) => ({ feature, weight: ((index % 7) - 3) / 10, advice: feature })),
    },
    { schemaVersion: 1, title: "Ties", rules: [{ feature: "bias", weight: 0, advice: "Equal" }] },
    {
      schemaVersion: 1,
      title: "Ordered cancellation",
      rules: [1e16, 1, -1e16].map((weight) => ({ feature: "bias", weight, advice: "Order" })),
    },
    {
      schemaVersion: 1,
      title: "Conditions",
      rules: FEATURES.flatMap((feature) => [
        {
          feature,
          weight: 0.3,
          advice: feature,
          when: { kind: "main", sourceCardIds: ["BT1-010"], minimum: { [feature]: 0 }, maximum: { [feature]: 3 } },
        },
        { feature, weight: -0.7, advice: feature, when: { minimum: { [feature]: -2 }, maximum: { [feature]: 0 } } },
        { feature, weight: 9, advice: feature, when: { kind: "never", sourceCardIds: [] } },
      ]),
    },
  ];
}

describe("public indexed rollout heuristic", () => {
  it.each([0, 1] as const)("matches every feature, source, conditional score and seeded choice for seat%i", (seat) => {
    const window = windowFixture();
    window.observation.seat = seat;
    for (const kind of ["main", "breeding", "selectCards", "respondEvade"]) {
      window.kind = kind;
      const context = createHeuristicFeatureContext(window);
      for (let index = 0; index < window.actions.length; index++) {
        const features = actionFeatures(window, index);
        expect(actionFeatures(window, index, context)).toEqual(features);
        const cardId = actionCardId(window, index);
        expect(actionCardId(window, index, context)).toBe(cardId);
        for (const program of programs())
          expect(scoreFastHeuristic(program, features, kind, cardId)).toBe(
            scoreHeuristicRules(program, features, kind, cardId).score,
          );
      }
      for (const program of programs())
        for (const seed of [0, 1, 42, -1, 0xffffffff])
          expect(chooseFastHeuristic(program, window, seed)).toBe(chooseHeuristic(program, window, seed));
    }
  });

  it("preserves exact accumulation and inclusive bounds for every numeric feature", () => {
    for (const feature of FEATURES) {
      for (const value of [-3, -0, 0, 1e-9, 1, 3, 100]) {
        const features = Object.fromEntries(FEATURES.map((key) => [key, key === feature ? value : 0])) as ReturnType<
          typeof actionFeatures
        >;
        const program: HeuristicProgram = {
          schemaVersion: 1,
          title: "Bounds",
          rules: [
            {
              feature,
              weight: 0.1,
              advice: "Inclusive",
              when: {
                kind: "main",
                sourceCardIds: ["BT1-010"],
                minimum: { [feature]: value },
                maximum: { [feature]: value },
              },
            },
            { feature, weight: -0.3, advice: "Minimum miss", when: { minimum: { [feature]: value + 1 } } },
            { feature, weight: 0.7, advice: "Maximum miss", when: { maximum: { [feature]: value - 1 } } },
          ],
        };
        for (const kind of ["main", "different"])
          for (const source of [undefined, "BT1-010", "BT1-011"])
            expect(scoreFastHeuristic(program, features, kind, source)).toBe(
              scoreHeuristicRules(program, features, kind, source).score,
            );
      }
    }
  });

  it("preserves first-match lookup precedence and isolates later public windows", () => {
    const window = windowFixture();
    window.observation.players[0]!.board[0]!.top.instanceId = "strong";
    window.observation.revealed.push({ ...card("body"), cardId: "BT1-011", dp: 99000 });
    const context = createHeuristicFeatureContext(window);
    for (let index = 0; index < window.actions.length; index++) {
      expect(actionFeatures(window, index, context)).toEqual(actionFeatures(window, index));
      expect(actionCardId(window, index, context)).toBe(actionCardId(window, index));
    }
    const before = chooseFastHeuristic(SEED_HEURISTIC, window, 42);
    const changed = structuredClone(window);
    changed.observation.players[0]!.hand[0]!.dp = 99000;
    expect(chooseFastHeuristic(SEED_HEURISTIC, changed, 42)).toBe(chooseHeuristic(SEED_HEURISTIC, changed, 42));
    expect(chooseFastHeuristic(SEED_HEURISTIC, window, 42)).toBe(before);
    expect(Object.isFrozen(context.zeroFeatures)).toBe(true);
  });
});
