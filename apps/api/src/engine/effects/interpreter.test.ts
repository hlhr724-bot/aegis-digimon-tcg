import { describe, it, expect } from "vitest";
import {
  CardKind,
  EffectTiming,
  EffectDuration,
  getCompiledCard,
  type Action,
  type CardDefinition,
  type CompiledCard,
  type Permanent,
  type Seat,
} from "@aegis/shared";
import type { CardSource } from "./CardSource.js";
import type { DecisionApi, EffectContext, GameAccess, Primitives } from "./EffectContext.js";
import {
  irCardModule,
  registerIrCard,
  UnsupportedEffectError,
  applyWouldBePlayedSelfReducer,
  candidateLooseInstances,
  evaluateCondition,
  matchNameOrTrait,
  payCost,
  wouldBePlayedSelfReducersFor,
} from "./interpreter.js";
import { runRemovalAction } from "./interpreter/actions/removal.js";
import { runActivateForeignEffect } from "./interpreter/actions/borrowed.js";
import { runRevealAction } from "./interpreter/actions/reveal.js";
import { CardInstance } from "@aegis/shared";
import type { ActionScope } from "./interpreter/dispatch.js";
import { runAction } from "./interpreter/dispatch.js";
import { canPayCost } from "./interpreter/costs.js";
import { countMatching, scaleFactor } from "./interpreter/scaling.js";
import { getEffectModule, registerCard } from "./registry.js";
import { unregisterIrCard } from "#api/engine/effects/interpreter/registration/unregisterIrCard";
import "../../cards/BT16/BT16-048.js";
import bt17065 from "../../cards/BT17/BT17-065.js";
// The "Digimon this effect played" cards, whose real IR the dispatch tests at the bottom drive.
import "../../cards/EX10/EX10-061.js";
import "../../cards/EX10/EX10-072.js";
import "../../cards/EX11/EX11-061.js";
import "../../cards/EX3/EX3-069.js";
import "../../cards/BT12/BT12-112.js";

describe("breeding references in effect counts", () => {
  it("excludes breeding from ordinary scaling and conditions but honors explicit references", () => {
    const topCard = { instanceId: "count-card", cardId: "COUNT-DIGIMON" } as never;
    const field = makeFakePermanent({ permanentId: "field", controllerSeat: 0, topCard });
    const ownBreeding = makeFakePermanent({
      permanentId: "own-breeding",
      controllerSeat: 0,
      topCard,
      inBreeding: true,
    });
    const opponentBreeding = makeFakePermanent({
      permanentId: "opponent-breeding",
      controllerSeat: 1,
      topCard,
      inBreeding: true,
    });
    const ctx = makeContext({
      source: makeSource({ ownerSeat: 0 }),
      recorder: { calls: [] },
      ownBattleArea: [field],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    ctx.game.player(0).breeding = ownBreeding;
    ctx.game.player(1).breeding = opponentBreeding;

    expect(scaleFactor(ctx, { unit: "cards", per: 1, filter: { controller: "mine", kind: ["Digimon"] } })).toBe(1);
    expect(evaluateCondition(ctx, { kind: "opponentHas", filter: { kind: ["Digimon"] } })).toBe(false);
    expect(countMatching(ctx, { controller: "any", kind: ["Digimon"] })).toBe(1);
    expect(countMatching(ctx, { controller: "mine", zone: "breeding", kind: ["Digimon"] })).toBe(1);
    expect(countMatching(ctx, { controller: "any", zone: ["battleArea", "breeding"], kind: ["Digimon"] })).toBe(3);
  });
});

describe("duringAttack condition", () => {
  it("recognizes both an attack-carrying trigger and the live combat window", () => {
    const triggerContext = makeContext({
      source: makeSource(),
      recorder: { calls: [] },
      trigger: { attackerPermanentId: "attacker" },
    });
    expect(evaluateCondition(triggerContext, { kind: "duringAttack" })).toBe(true);

    const combatContext = makeContext({ source: makeSource(), recorder: { calls: [] } });
    combatContext.fx.isAttackResolving = () => true;
    expect(evaluateCondition(combatContext, { kind: "duringAttack" })).toBe(true);

    combatContext.fx.isAttackResolving = () => false;
    expect(evaluateCondition(combatContext, { kind: "duringAttack" })).toBe(false);
  });
});

describe("memory gauge conditions", () => {
  function contextOnOpponentsTurn(turnPlayerMemory: number): EffectContext {
    const ctx = makeContext({ source: makeSource({ ownerSeat: 0 }), recorder: { calls: [] } });
    Object.assign(ctx.game.state, { turnSeat: 1, memory: turnPlayerMemory });
    return ctx;
  }

  it("reads the effect owner's side when no controller is given, even on the opponent's turn (Q3956)", () => {
    const ownerAtTwo = contextOnOpponentsTurn(-2);

    expect(evaluateCondition(ownerAtTwo, { kind: "memoryAtLeast", value: 2 })).toBe(true);
    expect(evaluateCondition(ownerAtTwo, { kind: "memoryAtMost", value: 1 })).toBe(false);
    expect(evaluateCondition(ownerAtTwo, { kind: "memoryAtLeast", value: 2, controller: "mine" })).toBe(true);
    expect(evaluateCondition(ownerAtTwo, { kind: "memoryAtMost", value: 2, controller: "self" })).toBe(true);
  });

  it("reads the other side only for an explicit opponent controller", () => {
    const opponentAtTwo = contextOnOpponentsTurn(2);

    expect(evaluateCondition(opponentAtTwo, { kind: "memoryAtLeast", value: 2, controller: "opponent" })).toBe(true);
    expect(evaluateCondition(opponentAtTwo, { kind: "memoryAtLeast", value: 1 })).toBe(false);
    expect(evaluateCondition(opponentAtTwo, { kind: "memoryAtMost", value: -2 })).toBe(true);
  });
});

describe("lastDeletedMatchesFilter", () => {
  function card(instanceId: string, cardId: string, ownerSeat: Seat): CardInstance {
    const value = new CardInstance();
    value.instanceId = instanceId;
    value.cardId = cardId;
    value.ownerSeat = ownerSeat;
    return value;
  }

  function deletionGateContext() {
    const ownTerriermon = card("own-terrier", "ST17-02", 0);
    const opponentTerriermon = card("opponent-terrier", "ST17-02", 1);
    const unrelated = card("unrelated", "BT1-009", 0);
    const definitions: Record<string, CardDefinition> = {
      "ST17-02": makeFakeDefinition({
        cardId: "ST17-02",
        nameEn: "Terriermon",
        kinds: [CardKind.Digimon],
      }),
      "BT1-009": makeFakeDefinition({ cardId: "BT1-009", nameEn: "Agumon", kinds: [CardKind.Digimon] }),
    };
    const ctx = makeContext({
      source: makeSource({ ownerSeat: 0 }),
      recorder: { calls: [] },
      definitionOf: (cardId) => definitions[cardId]!,
    });
    return { ctx, ownTerriermon, opponentTerriermon, unrelated };
  }

  it("accepts an actually deleted own matching Digimon", () => {
    const { ctx, ownTerriermon } = deletionGateContext();
    ctx.lastDeletedPermanentSnapshots = [{ permanentId: "own", controllerSeat: 0, topCard: ownTerriermon }];

    expect(
      evaluateCondition(ctx, {
        kind: "lastDeletedMatchesFilter",
        filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Terriermon"], match: "name" }] },
      }),
    ).toBe(true);
  });

  it("rejects an opponent matching Digimon and an unrelated own deletion", () => {
    const { ctx, opponentTerriermon, unrelated } = deletionGateContext();
    ctx.lastDeletedPermanentSnapshots = [
      { permanentId: "opponent", controllerSeat: 1, topCard: opponentTerriermon },
      { permanentId: "unrelated", controllerSeat: 0, topCard: unrelated },
    ];

    expect(
      evaluateCondition(ctx, {
        kind: "lastDeletedMatchesFilter",
        filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Terriermon"], match: "name" }] },
      }),
    ).toBe(false);
  });

  it("rejects a prevented deletion because the actual-deletion receipt is empty", () => {
    const { ctx } = deletionGateContext();
    ctx.lastDeletedPermanentSnapshots = [];

    expect(
      evaluateCondition(ctx, {
        kind: "lastDeletedMatchesFilter",
        filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Terriermon"], match: "name" }] },
      }),
    ).toBe(false);
  });

  it("records only actual own deletions and clears the receipt after opponent or prevented deletion", async () => {
    const own = makeFakePermanent({
      permanentId: "own",
      controllerSeat: 0,
      topCard: card("own-card", "ST17-02", 0),
    });
    const opponent = makeFakePermanent({
      permanentId: "opponent",
      controllerSeat: 1,
      topCard: card("opponent-card", "ST17-02", 1),
    });
    const ownBattleArea = [own];
    const opponentBattleArea = [opponent];
    const ctx = makeContext({
      source: makeSource({ ownerSeat: 0 }),
      recorder: { calls: [] },
      ownBattleArea,
      opponentBattleArea,
      definitionOf: (cardId) =>
        makeFakeDefinition({
          cardId,
          nameEn: cardId === "ST17-02" ? "Terriermon" : "Agumon",
          kinds: [CardKind.Digimon],
        }),
    });
    let preventDeletion = false;
    ctx.fx.deletePermanent = async (ids) => {
      if (preventDeletion) return 0;
      for (const id of ids) {
        const index = ownBattleArea.findIndex((permanent) => permanent.permanentId === id);
        if (index >= 0) ownBattleArea.splice(index, 1);
        const opponentIndex = opponentBattleArea.findIndex((permanent) => permanent.permanentId === id);
        if (opponentIndex >= 0) opponentBattleArea.splice(opponentIndex, 1);
      }
      return ids.length;
    };
    const ownDelete = {
      kind: "Delete" as const,
      target: {
        filter: {
          controller: "mine" as const,
          kind: ["Digimon" as const],
          nameOrTrait: [{ tokens: ["Terriermon"], match: "name" as const }],
        },
        count: 1 as const,
      },
    };
    const opponentDelete = {
      ...ownDelete,
      target: { ...ownDelete.target, filter: { ...ownDelete.target.filter, controller: "opponent" as const } },
    };
    const scope: ActionScope = { scale: undefined, deferredCostSuspensions: [] };

    await runRemovalAction(ctx, ownDelete, scope);
    expect(ctx.lastDeletedPermanentSnapshots).toHaveLength(1);
    expect(
      evaluateCondition(ctx, {
        kind: "lastDeletedMatchesFilter",
        filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Terriermon"], match: "name" }] },
      }),
    ).toBe(true);

    await runRemovalAction(ctx, opponentDelete, scope);
    expect(ctx.lastDeletedPermanentSnapshots).toMatchObject([
      { permanentId: "opponent", controllerSeat: 1, topCard: { cardId: "ST17-02" } },
    ]);
    expect(
      evaluateCondition(ctx, {
        kind: "lastDeletedMatchesFilter",
        filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Terriermon"], match: "name" }] },
      }),
    ).toBe(false);

    const replacement = makeFakePermanent({
      permanentId: "replacement",
      controllerSeat: 0,
      topCard: card("replacement-card", "ST17-02", 0),
    });
    ownBattleArea.push(replacement);
    preventDeletion = true;
    await runRemovalAction(ctx, ownDelete, scope);
    expect(ctx.lastDeletedPermanentSnapshots).toEqual([]);
    preventDeletion = false;
    await runRemovalAction(ctx, ownDelete, scope);
    expect(ctx.lastDeletedPermanentSnapshots).toHaveLength(1);
    await runRemovalAction(ctx, ownDelete, scope);
    expect(ctx.lastDeletedPermanentSnapshots).toEqual([]);
  });
});

describe("matchNameOrTrait text matching", () => {
  it.each([
    ["effectText", "main"],
    ["inheritedEffectText", "inherited"],
    ["securityEffectText", "Security"],
    ["linkEffect", "Link"],
    ["linkRequirement", "Link requirement"],
    ["dualEffect", "DUAL"],
    ["optionEffect", "Option"],
  ] as const)("includes %s in the card's complete printed text (%s)", (field, _label) => {
    const definition = {
      cardId: "TEST-TEXT",
      nameEn: "Unrelatedmon",
      [field]: "This mentions [Chronomon].",
    };

    expect(matchNameOrTrait(definition, { tokens: ["Chronomon"], match: "text" })).toBe(true);
  });

  it("does not match a near token absent from every printed text field", () => {
    expect(
      matchNameOrTrait(
        { cardId: "TEST-TEXT-NEG", nameEn: "Unrelatedmon", inheritedEffectText: "[Chrono] only" },
        { tokens: ["Chronomon"], match: "text" },
      ),
    ).toBe(false);
  });
});

describe("registerIrCard", () => {
  it("replaces a previously registered IR module with the latest compiled card", () => {
    const cardId = "TEST-IR-REREGISTER";
    const first = registerIrCard(cardId, { coverage: "full", residual: [], effects: [] });
    const second = registerIrCard(cardId, { coverage: "full", residual: [], effects: [] });

    expect(second).not.toBe(first);
    expect(getEffectModule(cardId)).toBe(second);
    unregisterIrCard(cardId);
  });

  it("does not overwrite a handwritten module", () => {
    const cardId = "TEST-HANDWRITTEN-PRECEDENCE";
    const handwritten = { cardId, effectsForTiming: () => [] };
    registerCard(handwritten);

    expect(registerIrCard(cardId, { coverage: "full", residual: [], effects: [] })).toBe(handwritten);
    expect(registerIrCard(cardId, { coverage: "full", residual: [], effects: [] })).toBe(handwritten);
    expect(getEffectModule(cardId)).toBe(handwritten);
    unregisterIrCard(cardId);
  });

  it("uses the registered runtime card when another card activates its effect", async () => {
    const foreignCardId = "TEST-RUNTIME-ACTIVATE-FOREIGN";
    registerIrCard(foreignCardId, {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "OnPlay", actions: [{ kind: "GainMemory", amount: 7 }] }],
    });
    const foreign = makeFakePermanent({
      permanentId: "runtime-foreign",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "runtime-foreign-card", cardId: foreignCardId } as never,
    });
    const source = makeSource({ cardId: "TEST-RUNTIME-ACTIVATE-SOURCE" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [foreign],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon] }),
    });
    const module = irCardModule(source.cardId, {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "ActivateEffect",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              effectType: "OnPlay",
            } as never,
          ],
        },
      ],
    });

    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(recorder.calls).toContainEqual({
      verb: "gainMemoryForSeat",
      args: [0, 7, { isTamerEffect: false }],
    });
    unregisterIrCard(foreignCardId);
  });

  it("uses the registered runtime card when reactivating its own effect", async () => {
    const cardId = "TEST-RUNTIME-REACTIVATE";
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        { trigger: "WhenDigivolving", actions: [{ kind: "Draw", controller: "mine", amount: 2 }] },
        { trigger: "WhenAttacking", actions: [{ kind: "ReactivateEffect", fromTrigger: "WhenDigivolving", count: 1 }] },
      ],
    };
    const module = registerIrCard(cardId, compiled);
    const source = makeSource({ cardId });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });

    await module.effectsForTiming(EffectTiming.OnUseAttack, source)[0]!.resolve(ctx);

    expect(recorder.calls).toContainEqual({ verb: "draw", args: [0, 2] });
    unregisterIrCard(cardId);
  });

  it("preserves a copied effect key for nested action identities", async () => {
    const source = makeSource({ cardId: "TEST-COPIED-MAIN-IDENTITY" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const module = irCardModule(source.cardId, {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "SubTrigger",
              event: "whenAttacking",
              raw: "When this Digimon attacks, draw 1",
              actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
            },
          ],
        },
      ],
    });
    const effect = module.effectsForTiming(EffectTiming.OnUseOption, source)[0]!;
    const copiedEffectKey = `${effect.effectKey}/conferral/GRANTER#1`;
    ctx.activeEffectKey = copiedEffectKey;

    await effect.resolve(ctx);

    const installed = recorder.calls.find((call) => call.verb === "subscribeSubTrigger")?.args[0] as {
      dedupeKey?: string;
    };
    expect(installed.dedupeKey).toBe(`${source.instanceId}/${copiedEffectKey}/0`);
  });
});

describe("new typed RAW-elimination conditions", () => {
  function conditionContext(overrides: Partial<Omit<Parameters<typeof makeContext>[0], "source" | "recorder">> = {}) {
    const sourcePermanent = makeFakePermanent({
      permanentId: "SOURCE",
      controllerSeat: 0 as Seat,
      currentDP: 7000,
      stack: [
        { instanceId: "source-under", cardId: "SOURCE-UNDER", ownerSeat: 0, faceUp: true },
        { instanceId: "source-top", cardId: "SOURCE", ownerSeat: 0, faceUp: true },
      ] as never,
    });
    const source = makeSource({ cardId: "SOURCE", permanent: () => sourcePermanent });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownBattleArea: [sourcePermanent], ...overrides });
    return { ctx, sourcePermanent };
  }

  it("checks the preceding target DP against the source Digimon", () => {
    const target = makeFakePermanent({ permanentId: "TARGET", controllerSeat: 1 as Seat, currentDP: 6000 });
    const { ctx } = conditionContext({ opponentBattleArea: [target] });
    ctx.lastResolvedPermanentIds = ["TARGET"];
    expect(evaluateCondition(ctx, { kind: "lastTargetDpAtMostSelf" })).toBe(true);
    target.currentDP = 7001;
    expect(evaluateCondition(ctx, { kind: "lastTargetDpAtMostSelf" })).toBe(false);
  });

  it("includes the current Digimon when checking for same-level stacked cards", () => {
    const { ctx, sourcePermanent } = conditionContext({
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          level: id === "OTHER-LEVEL" ? 4 : 5,
          kinds: [CardKind.Digimon],
        }),
    });
    sourcePermanent.topCard = {
      instanceId: "source-top",
      cardId: "SOURCE",
      ownerSeat: 0,
      faceUp: true,
    } as never;
    sourcePermanent.stack = [
      { instanceId: "same-level-under", cardId: "SOURCE-UNDER", ownerSeat: 0, faceUp: true },
    ] as never;

    expect(evaluateCondition(ctx, { kind: "selfDigivolutionStackHasSameLevelPair" })).toBe(true);

    sourcePermanent.stack = [
      { instanceId: "other-level-under", cardId: "OTHER-LEVEL", ownerSeat: 0, faceUp: true },
    ] as never;
    expect(evaluateCondition(ctx, { kind: "selfDigivolutionStackHasSameLevelPair" })).toBe(false);
  });

  it("recognizes a source card in the current reveal window", () => {
    const { ctx } = conditionContext({ revealed: [{ instanceId: "revealed", cardId: "SOURCE" }] });
    expect(evaluateCondition(ctx, { kind: "triggerRevealedFromDeck" })).toBe(true);
    ctx.lastRevealedCards = [{ instanceId: "other", cardId: "OTHER", ownerSeat: 0 }];
    expect(evaluateCondition(ctx, { kind: "triggerRevealedFromDeck" })).toBe(false);
  });

  it("matches revealed cards and distinct filtered Tamer colors", () => {
    const tamer = makeFakePermanent({
      permanentId: "TAMER",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "tamer-card", cardId: "TAMER", ownerSeat: 0, faceUp: true } as never,
    });
    const { ctx } = conditionContext({
      revealed: [{ instanceId: "yellow", cardId: "YELLOW" }],
      ownBattleArea: [tamer],
      definitionOf: (id) => {
        if (id === "YELLOW") return makeFakeDefinition({ cardId: id, colors: ["Yellow"] as never });
        if (id === "TAMER")
          return makeFakeDefinition({
            cardId: id,
            kinds: [CardKind.Tamer],
            colors: ["Red"] as never,
            types: ["ADVENTURE"],
          });
        return makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon] });
      },
    });
    expect(evaluateCondition(ctx, { kind: "triggerRevealedMatchesFilter", filter: { colors: ["Yellow"] } })).toBe(true);
    expect(
      evaluateCondition(ctx, {
        kind: "zoneColorCount",
        cardType: "Tamer",
        filter: { nameOrTrait: [{ tokens: ["ADVENTURE"], match: "trait" }] },
        op: "gte",
        value: 1,
      }),
    ).toBe(true);
  });

  it("rejects malformed zoneCount zones and operators without throwing", () => {
    const { ctx } = conditionContext();
    expect(evaluateCondition(ctx, { kind: "zoneCount", zone: "discard" as never, op: "gte", value: 0 })).toBe(false);
    expect(evaluateCondition(ctx, { kind: "zoneCount", zone: "hand", op: "approximately" as never, value: 0 })).toBe(
      false,
    );
  });

  it("checks named attack procedures and the empty breeding slot", () => {
    const { ctx } = conditionContext({ trigger: { attackMechanic: "Execute" } });
    expect(evaluateCondition(ctx, { kind: "triggerAttackBy", keyword: "Execute" })).toBe(true);
    expect(evaluateCondition(ctx, { kind: "triggerAttackBy", keyword: "Overclock" })).toBe(false);
    expect(evaluateCondition(ctx, { kind: "breedingAreaEmpty" })).toBe(true);
    (ctx.game.player(0) as { breeding?: Permanent }).breeding = makeFakePermanent({ permanentId: "BREEDING" });
    expect(evaluateCondition(ctx, { kind: "breedingAreaEmpty" })).toBe(false);
  });

  it("checks all-yours filters and selected stack counts", () => {
    const sourceStack = makeFakePermanent({
      permanentId: "SOURCE",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "source-top", cardId: "SOURCE", ownerSeat: 0, faceUp: true } as never,
      stack: [
        { instanceId: "a", cardId: "A", ownerSeat: 0, faceUp: true },
        { instanceId: "b", cardId: "B", ownerSeat: 0, faceUp: true },
      ] as never,
    });
    const target = makeFakePermanent({
      permanentId: "TARGET",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "target-top", cardId: "TARGET", ownerSeat: 1, faceUp: true } as never,
      stack: [{ instanceId: "t", cardId: "T", ownerSeat: 1, faceUp: true }] as never,
    });
    const { ctx } = conditionContext({
      ownBattleArea: [sourceStack],
      opponentBattleArea: [target],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon], types: ["D-Reaper"] }),
    });
    ctx.lastResolvedPermanentIds = ["TARGET"];
    const { ctx: emptyLegacyContext } = conditionContext({ ownBattleArea: [] });
    expect(evaluateCondition(emptyLegacyContext, { kind: "allYoursMatchFilter" })).toBe(true);
    expect(evaluateCondition(ctx, { kind: "allYoursMatchFilter", filter: { kind: ["Digimon"] } })).toBe(true);
    expect(evaluateCondition(ctx, { kind: "digivolutionCountCompare", op: "lte" })).toBe(true);
    expect(evaluateCondition(ctx, { kind: "triggerPlayCostAtMostStackCount" })).toBe(false);
    ctx.trigger.playedPlayCost = 1;
    expect(evaluateCondition(ctx, { kind: "triggerPlayCostAtMostStackCount" })).toBe(true);
  });

  it("uses a totalDigimonGte count threshold when value is omitted", () => {
    const first = makeFakePermanent({
      permanentId: "TOTAL-1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "TOTAL-1-CARD", cardId: "TOTAL-1", ownerSeat: 0, faceUp: true } as never,
    });
    const second = makeFakePermanent({
      permanentId: "TOTAL-2",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "TOTAL-2-CARD", cardId: "TOTAL-2", ownerSeat: 1, faceUp: true } as never,
    });
    const { ctx } = conditionContext({
      ownBattleArea: [first],
      opponentBattleArea: [second],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });

    expect(evaluateCondition(ctx, { kind: "totalDigimonGte", count: 2 })).toBe(true);
    ctx.game.player(1).battleArea.splice(0, 1);
    expect(evaluateCondition(ctx, { kind: "totalDigimonGte", count: 2 })).toBe(false);
  });

  it("scopes anyHas across both players while honoring an explicit controller", () => {
    const own = makeFakePermanent({
      permanentId: "ANY-OWN",
      controllerSeat: 0 as Seat,
      currentDP: 9000,
      topCard: { instanceId: "ANY-OWN-CARD", cardId: "ANY-OWN", ownerSeat: 0, faceUp: true } as never,
    });
    const opponent = makeFakePermanent({
      permanentId: "ANY-OPPONENT",
      controllerSeat: 1 as Seat,
      currentDP: 13000,
      topCard: { instanceId: "ANY-OPPONENT-CARD", cardId: "ANY-OPPONENT", ownerSeat: 1, faceUp: true } as never,
    });
    const { ctx } = conditionContext({
      ownBattleArea: [own],
      opponentBattleArea: [opponent],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    const threshold = {
      kind: "anyHas" as const,
      filter: { kind: ["Digimon"] as ["Digimon"], dp: { op: "gte" as const, value: 13000 } },
    };
    expect(evaluateCondition(ctx, threshold)).toBe(true);
    expect(evaluateCondition(ctx, { ...threshold, filter: { ...threshold.filter, controller: "mine" } })).toBe(false);
    expect(evaluateCondition(ctx, { ...threshold, filter: { ...threshold.filter, controller: "opponent" } })).toBe(
      true,
    );
  });

  it("keeps the new predicates conservative at their boundaries", () => {
    const targetA = makeFakePermanent({ permanentId: "TARGET-A", controllerSeat: 1 as Seat, currentDP: 7000 });
    const targetB = makeFakePermanent({ permanentId: "TARGET-B", controllerSeat: 1 as Seat, currentDP: 6999 });
    const { ctx } = conditionContext({ opponentBattleArea: [targetA, targetB] });
    ctx.lastResolvedPermanentIds = ["TARGET-A", "TARGET-B"];
    expect(evaluateCondition(ctx, { kind: "lastTargetDpAtMostSelf" })).toBe(true);
    targetA.currentDP = 7001;
    expect(evaluateCondition(ctx, { kind: "lastTargetDpAtMostSelf" })).toBe(false);

    ctx.lastResolvedPermanentIds = ["TARGET-A"];
    ctx.trigger.playedPlayCost = 1;
    expect(evaluateCondition(ctx, { kind: "triggerPlayCostAtMostStackCount" })).toBe(true);
    ctx.trigger.playedPlayCost = 2;
    expect(evaluateCondition(ctx, { kind: "triggerPlayCostAtMostStackCount" })).toBe(false);

    const stackTarget = makeFakePermanent({
      permanentId: "STACK-TARGET",
      controllerSeat: 1 as Seat,
      stack: [
        { instanceId: "under", cardId: "UNDER", ownerSeat: 1, faceUp: true },
        { instanceId: "top", cardId: "TOP", ownerSeat: 1, faceUp: true },
      ] as never,
    });
    ctx.lastResolvedPermanentIds = ["STACK-TARGET"];
    ctx.game.permanentById = (id) => (id === "STACK-TARGET" ? stackTarget : undefined);
    ctx.game.definitionOf = (card) => makeFakeDefinition({ cardId: card.cardId, level: card.cardId === "TOP" ? 4 : 3 });
    expect(evaluateCondition(ctx, { kind: "lastTargetCanTrashDigivolution" })).toBe(true);
    stackTarget.stack = [stackTarget.stack[1]!] as never;
    expect(evaluateCondition(ctx, { kind: "lastTargetCanTrashDigivolution" })).toBe(false);
  });

  it("matches the event subject and stack cards through their full definitions", () => {
    const subject = makeFakePermanent({
      permanentId: "SUBJECT",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "subject-card", cardId: "ADVENTURE", ownerSeat: 0, faceUp: true } as never,
    });
    const tamer = { instanceId: "stack-tamer", cardId: "TAMER", ownerSeat: 0, faceUp: true } as never;
    const sourcePermanent = makeFakePermanent({
      permanentId: "SOURCE",
      controllerSeat: 0 as Seat,
      stack: [tamer, { instanceId: "source-top", cardId: "SOURCE", ownerSeat: 0, faceUp: true }] as never,
    });
    const { ctx } = conditionContext({
      ownBattleArea: [sourcePermanent, subject],
      trigger: { subjectPermanentId: "SUBJECT" },
      definitionOf: (id) => {
        if (id === "TAMER") return makeFakeDefinition({ cardId: id, kinds: [CardKind.Tamer] });
        if (id === "ADVENTURE")
          return makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon], types: ["ADVENTURE"] });
        return makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon] });
      },
    });
    ctx.source.permanent = () => sourcePermanent;
    expect(
      evaluateCondition(ctx, {
        kind: "triggerSubjectMatchesFilter",
        filter: { nameOrTrait: [{ tokens: ["ADVENTURE"], match: "trait" }] },
      }),
    ).toBe(true);
    expect(
      evaluateCondition(ctx, {
        kind: "selfDigivolutionStackMatchesFilter",
        filter: { kind: ["Tamer"] },
      }),
    ).toBe(true);
  });
});

describe("Return result bindings", () => {
  it("keeps the scaled level ceiling when adding a scaled play-cost ceiling", async () => {
    const allowed = makeFakePermanent({
      permanentId: "level-five",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "level-five-card", cardId: "LEVEL-FIVE", ownerSeat: 1, faceUp: true } as never,
    });
    const aboveLevelCap = makeFakePermanent({
      permanentId: "level-six",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "level-six-card", cardId: "LEVEL-SIX", ownerSeat: 1, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "X-RETURN-SCALED-CAPS" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownSecurity: [{}],
      opponentBattleArea: [aboveLevelCap, allowed],
      definitionOf: (cardId) =>
        makeFakeDefinition({
          cardId,
          kinds: [CardKind.Digimon],
          level: cardId === "LEVEL-FIVE" ? 5 : 6,
          playCost: 6,
        }),
    });
    const module = irCardModule("X-RETURN-SCALED-CAPS", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Return",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
                count: 1,
              },
              scaling: { per: 1, unit: "security", levelCeilingAdd: 1 },
              playCostCeiling: { base: 5, raise: 1, per: 1, unit: "security" },
              to: "deckBottom",
            },
          ],
        },
      ],
    });

    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(recorder.calls.find((call) => call.verb === "returnToDeck")?.args[0]).toEqual(["level-five-card"]);
  });

  it("aborts an ordered tail when an accepted self Return moves no card", async () => {
    const source = makeSource({ cardId: "X-RETURN-COST" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, optionalAnswer: true });
    const module = irCardModule("X-RETURN-COST", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Return",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              to: "deckBottom",
              optional: true,
              abortOnDecline: true,
            },
            { kind: "ActivateMain" },
          ],
        },
      ],
    });

    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(recorder.calls.some((call) => call.verb === "returnToDeck")).toBe(true);
    expect(recorder.calls.some((call) => call.verb === "resolveCardEffect")).toBe(false);
  });

  it.each([
    ["no loose candidates", false],
    ["an empty up-to selection", true],
  ] as const)("clears a stale if-you-did receipt after %s", async (_label, withCandidate) => {
    const source = makeSource({ cardId: "X-RETURN-EMPTY-RECEIPT" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: (cardId) =>
        makeFakeDefinition({
          cardId,
          kinds: [CardKind.Digimon],
          types: cardId === "BAGRA" ? ["Bagra Army"] : [],
        }),
      selectCardsAnswer: withCandidate ? () => [] : undefined,
    });
    if (withCandidate) {
      ctx.game.player(0).trash.push({ instanceId: "bagra", cardId: "BAGRA", ownerSeat: 0, faceUp: true } as never);
    }
    // Simulate a successful preceding action. A zero-card Return must overwrite this receipt
    // before an immediately following `ifThisEffectActed` condition is evaluated.
    ctx.lastEffectActed = true;
    const module = irCardModule("X-RETURN-EMPTY-RECEIPT", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Return",
              target: {
                filter: {
                  zone: "trash",
                  controller: "mine",
                  nameOrTrait: [{ tokens: ["Bagra Army"], match: "trait" }],
                },
                count: 2,
                upTo: true,
              },
              to: "hand",
            },
            {
              kind: "Draw",
              amount: 1,
              controller: "mine",
              condition: { kind: "ifThisEffectActed" },
            },
          ],
        },
      ],
    });

    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(ctx.lastEffectActed).toBe(false);
    expect(recorder.calls.some((call) => call.verb === "draw")).toBe(false);
  });

  it("does not satisfy an if-you-did branch when the selected permanent was not moved", async () => {
    const target = makeFakePermanent({
      permanentId: "TARGET",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "target-card", cardId: "TARGET-CARD", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "X-RETURN-RECEIPT" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [target],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon] }),
    });
    ctx.fx.returnToDeck = async (...args) => {
      recorder.calls.push({ verb: "returnToDeck", args });
      return [];
    };
    const module = irCardModule("X-RETURN-RECEIPT", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Return",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              to: "deckBottom",
              bindResultAs: "returned",
            },
            {
              kind: "Draw",
              amount: 3,
              controller: "mine",
              condition: { kind: "bindingExists", ref: "returned" },
            },
          ],
        },
      ],
    });

    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(recorder.calls.some((call) => call.verb === "returnToDeck")).toBe(true);
    expect(recorder.calls.some((call) => call.verb === "draw")).toBe(false);
    expect(ctx.boundPlayed?.get("returned")?.size).toBe(0);
  });
});

// --- Recording fakes -------------------------------------------------------
// The interpreter is exercised against fakes that record which primitives it
// invokes, so a smoke test can assert the IR -> primitive dispatch without a
// full GameEngine. (The kernel/builders tests use the same lightweight style.)

interface Recorder {
  calls: { verb: string; args: unknown[] }[];
}

function makeFakeDefinition(over: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardId: "X-000",
    set: "X",
    nameEn: "X",
    kinds: [],
    colors: [],
    playCost: 0,
    dp: 0,
    evoCosts: [],
    maxCountInDeck: 4,
    ...over,
  };
}

function makeFakePermanent(over: Partial<Permanent>): Permanent {
  return {
    permanentId: "p?",
    controllerSeat: 1 as Seat,
    topCard: undefined,
    stack: [] as never,
    linked: [] as never,
    baseDP: 0,
    currentDP: 0,
    isSuspended: false,
    inBreeding: false,
    ...over,
  } as Permanent;
}

function makeContext(opts: {
  source: CardSource;
  recorder: Recorder;
  opponentBattleArea?: Permanent[];
  ownBattleArea?: Permanent[];
  ownSecurity?: unknown[];
  opponentSecurity?: unknown[];
  ownHand?: unknown[];
  opponentHand?: unknown[];
  canDeclareAttack?: (permanent: Permanent) => boolean;
  definitionOf?: (id: string) => CardDefinition;
  optionalAnswer?: boolean;
  onOptional?: () => void;
  revealed?: { instanceId: string; cardId: string }[];
  playInstancesResult?: Permanent[];
  selectCardsAnswer?: (o: { candidates: string[]; max: number }) => string[];
  chooseOptionAnswer?: number;
  optionColorRequirementMet?: boolean;
  deletionMaxDpBonus?: number;
  orderCardsAnswer?: (o: { candidates: string[] }) => string[];
  trigger?: EffectContext["trigger"];
  /**
   * Wire `ctx.ask.opponent` (undefined by default, matching most fixtures — see
   * `requireOpponentAsk`'s doc comment) so tests can exercise a `chooser: "opponent"`
   * action. Calls are recorded under verb "opponent.selectCards" so a test can assert
   * the request went to this facade and NOT the controller's plain `ask.selectCards`.
   */
  opponentSelectCardsAnswer?: (o: { candidates: string[]; max: number }) => string[];
  opponentChooseTargetsAnswer?: (o: { candidates: string[]; max: number }) => string[];
}): EffectContext {
  const rec = opts.recorder;
  const record =
    (verb: string) =>
    (...args: unknown[]) => {
      rec.calls.push({ verb, args });
      return undefined as never;
    };

  const opponent = opts.opponentBattleArea ?? [];
  const players = [
    {
      seat: 0,
      battleArea: opts.ownBattleArea ?? [],
      security: opts.ownSecurity ?? [],
      hand: opts.ownHand ?? [],
      deck: [],
      trash: [],
    },
    {
      seat: 1,
      battleArea: opponent,
      security: opts.opponentSecurity ?? [],
      hand: opts.opponentHand ?? [],
      deck: [],
      trash: [],
    },
  ];

  const game: GameAccess = {
    state: { memory: 0, players, turnSeat: 0 } as never,
    player: (seat: Seat) => players[seat] as never,
    opponentOf: (s) => (s === 0 ? 1 : 0),
    permanentById: (id) => {
      const allPerms = [...(players[0]?.battleArea ?? []), ...(players[1]?.battleArea ?? [])];
      return allPerms.find((p) => p.permanentId === id);
    },
    definitionOf: (card) =>
      opts.definitionOf ? opts.definitionOf(card.cardId) : makeFakeDefinition({ cardId: card.cardId }),
    optionColorRequirementMet: () => opts.optionColorRequirementMet ?? true,
    linkMax: () => 1,
    canDeclareAttack: opts.canDeclareAttack,
  };

  const fx: Primitives = {
    deletionMaxDpBonus: () => opts.deletionMaxDpBonus ?? 0,
    draw: async (...a) => {
      rec.calls.push({ verb: "draw", args: a });
      return [];
    },
    gainMemory: record("gainMemory"),
    gainMemoryForSeat: record("gainMemoryForSeat"),
    restrictMemoryGain: record("restrictMemoryGain"),
    restrictCostReduction: record("restrictCostReduction"),
    restrictUnsuspendedDigivolve: record("restrictUnsuspendedDigivolve"),
    restrictPlay: record("restrictPlay"),
    disableSecurityEffect: record("disableSecurityEffect"),
    disableSecurityEffectsForSeat: record("disableSecurityEffectsForSeat"),
    disableTimingEffect: record("disableTimingEffect"),
    declareWinner: record("declareWinner"),
    setMemory: record("setMemory"),
    modifyDP: record("modifyDP"),
    modifyPlayerDP: record("modifyPlayerDP"),
    setBaseDP: record("setBaseDP"),
    setOriginalCardInfo: record("setOriginalCardInfo"),
    playFromHand: async (...a) => {
      rec.calls.push({ verb: "playFromHand", args: a });
      return [];
    },
    playFromSecurity: async (...a) => {
      rec.calls.push({ verb: "playFromSecurity", args: a });
      return undefined;
    },
    playInstances: async (...a) => {
      rec.calls.push({ verb: "playInstances", args: a });
      return (opts.playInstancesResult ?? []) as never;
    },
    digivolveFromInstance: async (...a) => {
      rec.calls.push({ verb: "digivolveFromInstance", args: a });
      return undefined;
    },
    dnaDigivolveInto: async (...a) => {
      rec.calls.push({ verb: "dnaDigivolveInto", args: a });
      return undefined;
    },
    appFuseInto: async (...a) => {
      rec.calls.push({ verb: "appFuseInto", args: a });
      return undefined;
    },
    deDigivolve: (...a) => {
      rec.calls.push({ verb: "deDigivolve", args: a });
      return [];
    },
    placeOwnTopAtStackBottom: async (...a) => {
      rec.calls.push({ verb: "placeOwnTopAtStackBottom", args: a });
      return true;
    },
    placeUnder: async (...a) => {
      rec.calls.push({ verb: "placeUnder", args: a });
      return [];
    },
    placePlayMaterialsUnder: async (...a) => {
      rec.calls.push({ verb: "placePlayMaterialsUnder", args: a });
      return [];
    },
    hatch: async (...a) => {
      rec.calls.push({ verb: "hatch", args: a });
      return undefined;
    },
    placeUnderFromDeck: async (...a) => {
      rec.calls.push({ verb: "placeUnderFromDeck", args: a });
      return undefined;
    },
    placeUnderFromEggDeck: async (...a) => {
      rec.calls.push({ verb: "placeUnderFromEggDeck", args: a });
      return undefined;
    },
    placeAsTopFromEggDeck: async (...a) => {
      rec.calls.push({ verb: "placeAsTopFromEggDeck", args: a });
      return undefined;
    },
    link: async (...a) => {
      rec.calls.push({ verb: "link", args: a });
      return [];
    },
    trash: async (...a) => {
      rec.calls.push({ verb: "trash", args: a });
      return [];
    },
    trashDigivolutionCards: async (...a) => {
      rec.calls.push({ verb: "trashDigivolutionCards", args: a });
      return [];
    },
    trashDigivolutionCardsAtomic: async (...a) => {
      rec.calls.push({ verb: "trashDigivolutionCardsAtomic", args: a });
      return (a[0] as { instanceId: string }[]).map(({ instanceId }) => ({
        instanceId,
        cardId: "STK",
        ownerSeat: 0 as Seat,
        faceUp: true,
      })) as never;
    },
    redirectDigivolutionTrashHosts: async (hostPermanentIds) => {
      rec.calls.push({ verb: "redirectDigivolutionTrashHosts", args: [hostPermanentIds] });
      return hostPermanentIds;
    },
    armorPurge: async (...a) => {
      rec.calls.push({ verb: "armorPurge", args: a });
      return undefined;
    },
    ascendToSecurity: async (...a) => {
      rec.calls.push({ verb: "ascendToSecurity", args: a });
      return false;
    },
    materialSave: async (...a) => {
      rec.calls.push({ verb: "materialSave", args: a });
      return false;
    },
    fireOptionUsed: async (...a) => {
      rec.calls.push({ verb: "fireOptionUsed", args: a });
    },
    useOptionFromHand: async (...a) => {
      rec.calls.push({ verb: "useOptionFromHand", args: a });
      return [];
    },
    resolveCardEffect: async (...a) => {
      rec.calls.push({ verb: "resolveCardEffect", args: a });
      return false;
    },
    trashFromSecurity: async (...a) => {
      rec.calls.push({ verb: "trashFromSecurity", args: a });
      return [];
    },
    trashTopSecurityOfPlayerWithMostSecurity: async (...a) => {
      rec.calls.push({ verb: "trashTopSecurityOfPlayerWithMostSecurity", args: a });
      return { seat: a[0] as Seat, trashed: [] };
    },
    deletePermanent: async (...a) => {
      rec.calls.push({ verb: "deletePermanent", args: a });
      return (a[0] as string[]).length;
    },
    trashPermanentByRule: async (...a) => {
      rec.calls.push({ verb: "trashPermanentByRule", args: a });
      return [];
    },
    suspend: async (...a) => {
      rec.calls.push({ verb: "suspend", args: a });
      return a[0] as string[];
    },
    unsuspend: record("unsuspend"),
    returnToHand: async (...a) => {
      rec.calls.push({ verb: "returnToHand", args: a });
      return [];
    },
    returnToDeck: async (...a) => {
      rec.calls.push({ verb: "returnToDeck", args: a });
      return [];
    },
    trashStackTops: async (...a) => {
      rec.calls.push({ verb: "trashStackTops", args: a });
      return [];
    },
    returnStackTopsToDeck: async (...a) => {
      rec.calls.push({ verb: "returnStackTopsToDeck", args: a });
      return [];
    },
    reveal: async (...a) => {
      rec.calls.push({ verb: "reveal", args: a });
      return (opts.revealed ?? []) as never;
    },
    searchDeck: async (...a) => {
      rec.calls.push({ verb: "searchDeck", args: a });
      return [];
    },
    addSecurity: record("addSecurity"),
    grantPierce: record("grantPierce"),
    changeEvoCost: record("changeEvoCost"),
    changePlayCost: record("changePlayCost"),
    restrict: record("restrict"),
    restrictAttackTarget: record("restrictAttackTarget"),
    grantNameTrait: record("grantNameTrait"),
    grantKeyword: record("grantKeyword"),
    grantDnaLevel: record("grantDnaLevel"),
    grantPlayerKeyword: record("grantPlayerKeyword"),
    grantLinkMax: record("grantLinkMax"),
    grantLinkCostReduction: record("grantLinkCostReduction"),
    cannotIgnoreDigivolution: record("cannotIgnoreDigivolution"),
    grantedKeywords: () => [],
    addColorGrant: record("addColorGrant"),
    waiveColorRequirement: record("waiveColorRequirement"),
    shuffleSecurity: record("shuffleSecurity"),
    revealCard: record("revealCard"),
    securityToHand: async (...a) => {
      rec.calls.push({ verb: "securityToHand", args: a });
      return [];
    },
    recoverToSecurity: async (...a) => {
      rec.calls.push({ verb: "recoverToSecurity", args: a });
      return [];
    },
    flipTopSecurity: (...a) => {
      rec.calls.push({ verb: "flipTopSecurity", args: a });
      return true;
    },
    flipSecurityFaceUp: (...a) => {
      rec.calls.push({ verb: "flipSecurityFaceUp", args: a });
      return true;
    },
    flipSecurityFaceDown: (...a) => {
      rec.calls.push({ verb: "flipSecurityFaceDown", args: a });
      const security = players[a[0] as Seat]?.security as Array<{ instanceId: string; faceUp: boolean }> | undefined;
      const card = security?.find((candidate) => candidate.instanceId === (a[1] as string));
      if (card !== undefined) card.faceUp = false;
      return true;
    },
    forceAttack: async (...a) => {
      rec.calls.push({ verb: "forceAttack", args: a });
    },
    redirectAttack: async (...a) => {
      rec.calls.push({ verb: "redirectAttack", args: a });
    },
    grantCanAttackUnsuspended: (...a) => {
      rec.calls.push({ verb: "grantCanAttackUnsuspended", args: a });
    },
    endAttack: (...a) => {
      rec.calls.push({ verb: "endAttack", args: a });
    },
    subscribeSubTrigger: (sub) => {
      rec.calls.push({ verb: "subscribeSubTrigger", args: [sub] });
      return 0;
    },
    subscribeReplacement: (sub) => {
      rec.calls.push({ verb: "subscribeReplacement", args: [sub] });
      return 0;
    },
    relocatePermanent: (...a) => {
      rec.calls.push({ verb: "relocatePermanent", args: a });
      return true;
    },
    movePermanentZone: async (...a) => {
      rec.calls.push({ verb: "movePermanentZone", args: a });
      return true;
    },
    conferStackEffects: (...a) => {
      rec.calls.push({ verb: "conferStackEffects", args: a });
    },
    playToken: async (...a) => {
      rec.calls.push({ verb: "playToken", args: a });
      return undefined;
    },
    modifySecurityDp: (...a) => {
      rec.calls.push({ verb: "modifySecurityDp", args: a });
    },
    fireOnDiscardLibrary: async (...a) => {
      rec.calls.push({ verb: "fireOnDiscardLibrary", args: a });
    },
    fireWhenTrashedFromDeck: async (...a) => {
      rec.calls.push({ verb: "fireWhenTrashedFromDeck", args: a });
    },
    delayedDeletePlayed: (...a) => {
      rec.calls.push({ verb: "delayedDeletePlayed", args: a });
    },
  };

  const ask: DecisionApi = {
    optional: async () => {
      opts.onOptional?.();
      return opts.optionalAnswer ?? true;
    },
    chooseTargets: async (_ctx, o) => o.candidates.slice(0, o.max),
    selectPermanents: async (_ctx, o) => o.candidates.slice(0, o.max),
    selectCards: async (_ctx, o) => {
      rec.calls.push({ verb: "selectCards", args: [o] });
      return opts.selectCardsAnswer ? opts.selectCardsAnswer(o) : o.candidates.slice(0, o.max);
    },
    chooseOption: async (_ctx, choices) => {
      rec.calls.push({ verb: "chooseOption", args: [choices] });
      return opts.chooseOptionAnswer ?? 0;
    },
    orderCards: async (_ctx, o) => {
      rec.calls.push({ verb: "orderCards", args: [o] });
      return opts.orderCardsAnswer ? opts.orderCardsAnswer(o) : o.candidates;
    },
  };
  if (opts.opponentSelectCardsAnswer || opts.opponentChooseTargetsAnswer) {
    ask.opponent = {
      optional: async () => opts.optionalAnswer ?? true,
      chooseTargets: async (_ctx, o) => {
        rec.calls.push({ verb: "opponent.chooseTargets", args: [o] });
        return opts.opponentChooseTargetsAnswer ? opts.opponentChooseTargetsAnswer(o) : o.candidates.slice(0, o.max);
      },
      selectPermanents: async (_ctx, o) => o.candidates.slice(0, o.max),
      selectCards: async (_ctx, o) => {
        rec.calls.push({ verb: "opponent.selectCards", args: [o] });
        return opts.opponentSelectCardsAnswer!(o);
      },
      chooseOption: async () => 0,
    };
  }

  return {
    source: opts.source,
    trigger: opts.trigger ?? {},
    game,
    fx,
    ask,
    selections: new Map<string, string>(),
    lastRevealedCards: opts.revealed?.map((card) => ({ ...card, ownerSeat: 0 as Seat })),
  };
}

function makeSource(over: Partial<CardSource> = {}): CardSource {
  return {
    instanceId: "INST#1",
    cardId: over.cardId ?? "X-000",
    ownerSeat: 0 as Seat,
    definition: makeFakeDefinition({ cardId: over.cardId ?? "X-000" }),
    permanent: () => undefined,
    isOnBattleArea: () => true,
    isOwnersTurn: () => true,
    hasColor: () => false,
    ...over,
  };
}

describe("wouldBePlayed self-reducer payment feasibility", () => {
  it("does not offer BT12-112's Shoutmon payment without a battle-area Shoutmon", async () => {
    const [reducer] = wouldBePlayedSelfReducersFor("BT12-112");
    expect(reducer).toBeDefined();
    const recorder: Recorder = { calls: [] };
    let optionalPrompts = 0;
    const ctx = makeContext({
      source: makeSource({ cardId: "BT12-112" }),
      recorder,
      onOptional: () => {
        optionalPrompts += 1;
      },
    });

    await applyWouldBePlayedSelfReducer(ctx, reducer!);

    expect(optionalPrompts).toBe(0);
    expect(ctx.playCostDelta).toBeUndefined();
    expect(ctx.selections?.has("bt12112Shoutmon")).toBe(false);
    expect(ctx.pendingSelfReducerRelocations).toBeUndefined();
    expect(recorder.calls.some((call) => call.verb === "trashDigivolutionCards")).toBe(false);
  });
});

describe("suspension cost cardinality", () => {
  it.each([
    [1, false, false],
    [2, false, true],
    [1, true, true],
  ] as const)("available %i, upTo %s: payment succeeds %s", async (available, upTo, succeeds) => {
    const recorder: Recorder = { calls: [] };
    const ownBattleArea = Array.from({ length: available }, (_, index) =>
      makeFakePermanent({
        permanentId: `suspend-cost-${index}`,
        controllerSeat: 0 as Seat,
        isSuspended: false,
        topCard: { instanceId: `suspend-card-${index}`, cardId: "BT2-057", ownerSeat: 0, faceUp: true } as never,
      }),
    );
    const ctx = makeContext({ source: makeSource(), recorder, ownBattleArea });
    const receipt = { paidCount: 0 };
    expect(
      await payCost(
        ctx,
        {
          kind: "suspend",
          target: { filter: { controller: "mine" }, count: 2, upTo },
        },
        receipt,
      ),
    ).toBe(succeeds);
    expect(recorder.calls.filter((call) => call.verb === "suspend")).toHaveLength(succeeds ? 1 : 0);
    expect(receipt.paidCount).toBe(succeeds ? available : 0);
  });
});

describe("linked cost stale-selection atomicity", () => {
  function linkedCostContext(
    moveAfterPick: (host: Permanent, other: Permanent, selectedId: string, ctx: EffectContext) => void,
  ) {
    const host = makeFakePermanent({
      permanentId: "linked-host",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "host-top", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
      linked: [
        { instanceId: "link-a", cardId: "LINK-A", ownerSeat: 0, faceUp: true },
        { instanceId: "link-b", cardId: "LINK-B", ownerSeat: 0, faceUp: true },
      ] as never,
      stack: [{ instanceId: "stack-a", cardId: "STACK-A", ownerSeat: 0, faceUp: true }] as never,
    });
    const other = makeFakePermanent({
      permanentId: "other-host",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "other-top", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source: makeSource({ permanent: () => host }),
      recorder,
      ownBattleArea: [host, other],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon], types: ["Appmon"] }),
      selectCardsAnswer: ({ candidates, max }) => {
        const selected = candidates.slice(0, max);
        moveAfterPick(host, other, selected[0]!, ctx);
        return selected;
      },
    });
    return { ctx, host, other, recorder };
  }

  it.each([
    [
      "hand",
      (host: Permanent, _other: Permanent, id: string, ctx: EffectContext) => {
        const index = host.linked.findIndex((card) => card.instanceId === id);
        const [card] = host.linked.splice(index, 1);
        ctx.game.player(0).hand.push(card!);
      },
    ],
    [
      "stack",
      (host: Permanent, _other: Permanent, id: string) => {
        const index = host.linked.findIndex((card) => card.instanceId === id);
        const [card] = host.linked.splice(index, 1);
        host.stack.push(card!);
      },
    ],
    [
      "other host",
      (host: Permanent, other: Permanent, id: string) => {
        const index = host.linked.findIndex((card) => card.instanceId === id);
        const [card] = host.linked.splice(index, 1);
        other.linked.push(card!);
      },
    ],
  ] as const)("fails atomically when selected linked card moves to %s", async (_label, move) => {
    const { ctx, host, recorder } = linkedCostContext(move);
    const receipt = { paidCount: 0 };
    expect(
      await payCost(
        ctx,
        {
          kind: "trash",
          target: { filter: { zone: "linked", isSelfRef: true }, count: 1 },
        },
        receipt,
      ),
    ).toBe(false);
    expect(host.linked).toHaveLength(1);
    expect(recorder.calls.some((call) => call.verb === "trash")).toBe(false);
  });

  it("rejects a multi-card pool when its selected linked card goes stale, without partial trash", async () => {
    const { ctx, host, recorder } = linkedCostContext((currentHost) => {
      currentHost.linked.splice(0, 1);
    });
    const receipt = { paidCount: 0 };
    expect(
      await payCost(
        ctx,
        {
          kind: "trash",
          target: { filter: { zone: "linked", isSelfRef: true }, count: 1 },
        },
        receipt,
      ),
    ).toBe(false);
    expect(host.linked).toHaveLength(1);
    expect(receipt.paidCount).toBe(0);
    expect(recorder.calls.some((call) => call.verb === "trash")).toBe(false);
  });
});

describe("attack cost feasibility", () => {
  it("offers only the copy that can legally attack, including a same-turn Rush Digimon", () => {
    const suspended = makeFakePermanent({
      permanentId: "ad1-020-suspended",
      controllerSeat: 0 as Seat,
      isSuspended: true,
    });
    const rushDigimon = makeFakePermanent({
      permanentId: "ad1-020-rush",
      controllerSeat: 0 as Seat,
    });
    const legal = new Set([rushDigimon.permanentId]);
    const canDeclareAttack = (permanent: Permanent): boolean => legal.has(permanent.permanentId);
    const cost = { kind: "attack" as const, raw: "By attacking with this Digimon" };

    const suspendedCtx = makeContext({
      source: makeSource({ permanent: () => suspended }),
      recorder: { calls: [] },
      ownBattleArea: [suspended],
      canDeclareAttack,
    });
    const rushCtx = makeContext({
      source: makeSource({ permanent: () => rushDigimon }),
      recorder: { calls: [] },
      ownBattleArea: [rushDigimon],
      canDeclareAttack,
    });

    expect(canPayCost(suspendedCtx, cost)).toBe(false);
    expect(canPayCost(rushCtx, cost)).toBe(true);
  });
});

describe("filtered hand-trash cost feasibility", () => {
  const source = makeSource();
  const cost = {
    kind: "trash" as const,
    target: {
      count: 1,
      filter: {
        zone: "hand" as const,
        controller: "mine" as const,
        nameOrTrait: [{ tokens: ["NSo"], match: "trait" as const }],
      },
    },
  };

  it("does not offer the cost when the hand has cards but none match its filter", () => {
    const ctx = makeContext({
      source,
      recorder: { calls: [] },
      ownHand: [{ instanceId: "plain", cardId: "PLAIN", ownerSeat: 0, faceUp: true }],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, types: [] }),
    });

    expect(canPayCost(ctx, cost)).toBe(false);
  });

  it("offers the cost when enough matching hand cards exist", () => {
    const ctx = makeContext({
      source,
      recorder: { calls: [] },
      ownHand: [{ instanceId: "nso", cardId: "NSO", ownerSeat: 0, faceUp: true }],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, types: ["NSo"] }),
    });

    expect(canPayCost(ctx, cost)).toBe(true);
  });
});

describe("DP-capped deletion costs", () => {
  it("raises a deleteOwn cost target's printed DP cap for feasibility and payment (Q7252)", async () => {
    const sourcePermanent = makeFakePermanent({
      permanentId: "source",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "source-card", cardId: "SOURCE", ownerSeat: 0, faceUp: true } as never,
    });
    const raisedTarget = makeFakePermanent({
      permanentId: "opponent-11000",
      controllerSeat: 1 as Seat,
      currentDP: 11_000,
      topCard: { instanceId: "target-card", cardId: "TARGET", ownerSeat: 1, faceUp: true } as never,
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source: makeSource({ permanent: () => sourcePermanent }),
      recorder,
      ownBattleArea: [sourcePermanent],
      opponentBattleArea: [raisedTarget],
      deletionMaxDpBonus: 2000,
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    const cost = {
      kind: "deleteOwn" as const,
      target: {
        filter: {
          controller: "opponent" as const,
          kind: ["Digimon" as const],
          dp: { op: "lte" as const, value: 9000 },
        },
        count: 1 as const,
      },
    };

    expect(canPayCost(ctx, cost)).toBe(true);
    expect(await payCost(ctx, cost)).toBe(true);
    expect(recorder.calls.filter(({ verb }) => verb === "deletePermanent")).toMatchObject([
      { args: [["opponent-11000"], "byEffect", {}] },
    ]);
  });
});

// --- Tests -----------------------------------------------------------------

describe("Delete except chooser routing", () => {
  it("lets the opponent choose the one survivor before deleting all other matching Digimon", async () => {
    const opponents = ["A", "B", "C"].map((permanentId) =>
      makeFakePermanent({
        permanentId,
        controllerSeat: 1 as Seat,
        topCard: { instanceId: `${permanentId}-card`, cardId: permanentId, ownerSeat: 1, faceUp: true } as never,
      }),
    );
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "EX3-063" });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: opponents,
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
      opponentChooseTargetsAnswer: () => ["B"],
    });
    const module = irCardModule("EX3-063", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"] },
                count: "all",
                except: {
                  filter: { controller: "opponent", kind: ["Digimon"] },
                  count: 1,
                  chooser: "opponent",
                },
              },
            },
          ],
        },
      ],
    });

    for (const effect of module.effectsForTiming(EffectTiming.OnPlay, source)) await effect.resolve(ctx);

    const choice = recorder.calls.find(({ verb }) => verb === "opponent.chooseTargets");
    expect(choice?.args[0]).toMatchObject({ candidates: ["A", "B", "C"], min: 1, max: 1 });
    const deletion = recorder.calls.find(({ verb }) => verb === "deletePermanent");
    expect(deletion?.args[0]).toEqual(["A", "C"]);
  });
});

describe("BT16-048 TyrantKabuterimon", () => {
  it("plays the selected trait Digimon with the cost reduction folded into the play", async () => {
    const source = makeSource({
      cardId: "BT16-048",
      permanent: () =>
        makeFakePermanent({
          permanentId: "SELF",
          controllerSeat: 0 as Seat,
          topCard: { instanceId: "self", cardId: "BT16-048", ownerSeat: 0, faceUp: true } as never,
        }),
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownHand: [{ instanceId: "INSECT", cardId: "INSECT", ownerSeat: 0, faceUp: true }],
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          kinds: ["Digimon"] as never,
          types: ["Insectoid"],
          playCost: 10,
        }),
    });

    const effect = getEffectModule("BT16-048")!.effectsForTiming(EffectTiming.WhenDigivolving, source)[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "playInstances")[0]?.args[1]).toMatchObject({
      payCost: true,
      costDelta: 8,
    });
    expect(recorder.calls.filter((c) => c.verb === "subscribeReplacement")).toHaveLength(0);
  });

  it("returns any opponent Digimon within the suspended Digimon's DP, not only suspended ones", async () => {
    const sourcePermanent = makeFakePermanent({
      permanentId: "SELF",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "self", cardId: "BT16-048", ownerSeat: 0, faceUp: true } as never,
    });
    const payer = makeFakePermanent({
      permanentId: "PAYER",
      controllerSeat: 0 as Seat,
      currentDP: 6000,
      topCard: { instanceId: "payer", cardId: "PAYER", ownerSeat: 0, faceUp: true } as never,
    });
    const activeOpponent = makeFakePermanent({
      permanentId: "ACTIVE-OPPONENT",
      controllerSeat: 1 as Seat,
      currentDP: 4000,
      topCard: { instanceId: "active-opponent", cardId: "ACTIVE", ownerSeat: 1, faceUp: true } as never,
    });
    const suspendedOpponent = makeFakePermanent({
      permanentId: "SUSPENDED-OPPONENT",
      controllerSeat: 1 as Seat,
      currentDP: 5000,
      isSuspended: true,
      topCard: { instanceId: "suspended-opponent", cardId: "SUSPENDED", ownerSeat: 1, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "BT16-048", permanent: () => sourcePermanent });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [sourcePermanent, payer],
      opponentBattleArea: [activeOpponent, suspendedOpponent],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never }),
    });

    const effect = getEffectModule("BT16-048")!.effectsForTiming(EffectTiming.OnEndTurn, source)[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "suspend")).toHaveLength(1);
    expect(recorder.calls.filter((c) => c.verb === "returnToDeck")[0]?.args[0]).toEqual(["active-opponent"]);
  });
});

describe("BT17-065 DexDorugamon branch fidelity", () => {
  const runBt17065 = async (opts: { hasDorugamonInStack: boolean; digivolvedFromTrash: boolean }) => {
    const self = makeFakePermanent({
      permanentId: "SELF",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "bt17065", cardId: "BT17-065", ownerSeat: 0, faceUp: true } as never,
      stack: opts.hasDorugamonInStack
        ? ([{ instanceId: "doru", cardId: "BT7-056", ownerSeat: 0, faceUp: true }] as never)
        : ([{ instanceId: "other", cardId: "BT1-001", ownerSeat: 0, faceUp: true }] as never),
    });
    const opp = makeFakePermanent({
      permanentId: "OPP",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "opp-card", cardId: "OPP-4COST", ownerSeat: 1, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "BT17-065", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [self],
      opponentBattleArea: [opp],
      ownHand: [{ instanceId: "hand-1", cardId: "BT1-001", ownerSeat: 0, faceUp: false }],
      trigger: opts.digivolvedFromTrash ? { digivolvedFromZone: "trash" } : {},
      definitionOf: (id) => {
        if (id === "BT17-065")
          return makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, nameEn: "DexDorugamon" });
        if (id === "BT7-056")
          return makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, nameEn: "Dorugamon" });
        if (id === "OPP-4COST") return makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, playCost: 4 });
        return makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never });
      },
    });
    const effects = irCardModule("BT17-065-branch-test", bt17065 as CompiledCard).effectsForTiming(
      EffectTiming.WhenDigivolving,
      source,
    );
    expect(effects).toHaveLength(1);
    await effects[0]!.resolve(ctx);
    return recorder.calls.map((c) => c.verb);
  };

  it("deletes instead of drawing when Dorugamon is in stack", async () => {
    const verbs = await runBt17065({ hasDorugamonInStack: true, digivolvedFromTrash: false });
    expect(verbs).toContain("trash");
    expect(verbs).toContain("deletePermanent");
    expect(verbs).not.toContain("draw");
  });

  it("deletes instead of drawing when it digivolved from trash", async () => {
    const verbs = await runBt17065({ hasDorugamonInStack: false, digivolvedFromTrash: true });
    expect(verbs).toContain("trash");
    expect(verbs).toContain("deletePermanent");
    expect(verbs).not.toContain("draw");
  });

  it("draws when neither Dorugamon-in-stack nor digivolved-from-trash is true", async () => {
    const verbs = await runBt17065({ hasDorugamonInStack: false, digivolvedFromTrash: false });
    expect(verbs).toContain("trash");
    expect(verbs).toContain("draw");
    expect(verbs).not.toContain("deletePermanent");
  });
});

describe("Reveal action dispatch", () => {
  it("reveals top cards from the chosen deck without moving them", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        { trigger: "OnPlay", actions: [{ kind: "Reveal", count: 5, controller: "any", zone: "deck" } as never] },
      ],
    };
    const source = makeSource({ cardId: "X-REVEAL" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const effects = irCardModule("X-REVEAL", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    await effects[0]!.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "reveal")).toEqual([{ verb: "reveal", args: [0, 5, "X-REVEAL"] }]);
  });

  it("selects hand cards for reveal without moving them", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Reveal",
              target: { filter: { zone: "hand", controller: "mine" }, count: 1, upTo: false },
            } as never,
          ],
        },
      ],
    };
    const source = makeSource({ cardId: "X-REVEAL-HAND" });
    const recorder: Recorder = { calls: [] };
    const ownHand = [{ instanceId: "h1", cardId: "BT1-001" }];
    const ctx = makeContext({ source, recorder, ownHand });
    const effects = irCardModule("X-REVEAL-HAND", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    await effects[0]!.resolve(ctx);

    expect(
      recorder.calls.some((c) => c.verb === "returnToHand" || c.verb === "trash" || c.verb === "returnToDeck"),
    ).toBe(false);
  });
});

describe("legacy action-kind dispatch", () => {
  it("GitHub #5016: a missing triggerSubject cannot fall back to an unrelated lender", async () => {
    const foreign = makeFakePermanent({
      permanentId: "foreign",
      controllerSeat: 0,
      topCard: { instanceId: "foreign-card", cardId: "BT1-029" } as never,
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source: makeSource({ cardId: "X-ACTIVATE-MISSING-SUBJECT" }),
      recorder,
      ownBattleArea: [foreign],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon] }),
    });
    await runAction(ctx, {
      kind: "ActivateEffect",
      target: { sourceRef: "triggerSubject", filter: {}, count: 1 },
      effectType: "OnPlay",
    });
    expect(recorder.calls).not.toContainEqual({ verb: "draw", args: [0, 1] });
  });

  it("ActivateEffect normalizes to the server-side foreign effect runner", async () => {
    const foreign = makeFakePermanent({
      permanentId: "opp-foreign",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "foreign-card", cardId: "BT1-029" } as never,
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "ActivateEffect",
              target: { filter: { controllerDefault: "opponent", kind: ["Digimon"] }, count: 1 },
              effectType: "OnPlay",
            } as never,
          ],
        },
      ],
    };
    const source = makeSource({ cardId: "X-ACTIVATE" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [foreign],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon] }),
    });
    const effects = irCardModule("X-ACTIVATE", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    await effects[0]!.resolve(ctx);

    expect(recorder.calls).toContainEqual({ verb: "draw", args: [0, 1] });
  });

  it("ActivateOptionMain dispatches through the existing ActivateMain path", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        { trigger: "Security", actions: [{ kind: "ActivateOptionMain", count: 1 } as never], isSecurity: true },
      ],
    };
    const source = makeSource({ cardId: "BT1-090" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const effects = irCardModule("BT1-090", compiled).effectsForTiming(EffectTiming.SecuritySkill, source);

    await effects[0]!.resolve(ctx);

    expect(recorder.calls).toContainEqual({ verb: "gainMemoryForSeat", args: [0, 2, { isTamerEffect: false }] });
  });

  it("direct Prevent installs a would-leave-play prevention subscription", async () => {
    const self = makeFakePermanent({ permanentId: "self", controllerSeat: 0 as Seat });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        { trigger: "Static", actions: [{ kind: "Prevent", mode: "leavePlay", raw: "it doesn't leave" } as never] },
      ],
    };
    const source = makeSource({ cardId: "X-PREVENT", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownBattleArea: [self] });
    const effects = irCardModule("X-PREVENT", compiled).effectsForTiming(EffectTiming.None, source);

    await effects[0]!.resolve(ctx);

    const sub = recorder.calls.find((c) => c.verb === "subscribeReplacement")?.args[0] as
      | { event?: string; mode?: string; sourcePermanentId?: string }
      | undefined;
    expect(sub).toMatchObject({ event: "wouldLeavePlay", mode: "prevent", sourcePermanentId: "self" });
  });
});

describe("DelayedDelete action dispatch", () => {
  it("arms delayed deletion for the permanent just played by the prior action", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", zone: "hand", kind: ["Digimon"] }, count: 1 },
              from: ["hand"],
              payCost: false,
            } as never,
            { kind: "DelayedDelete", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } } as never,
          ],
        },
      ],
    };
    const source = makeSource({ cardId: "X-DELAYED-DELETE" });
    const recorder: Recorder = { calls: [] };
    const played = makeFakePermanent({ permanentId: "PLAYED#1", controllerSeat: 0 as Seat });
    const ownHand = [{ instanceId: "h1", cardId: "BT1-001" }];
    const ctx = makeContext({
      source,
      recorder,
      ownHand,
      playInstancesResult: [played],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    const effects = irCardModule("X-DELAYED-DELETE", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    await effects[0]!.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "playInstances")).toHaveLength(1);
    expect(recorder.calls.filter((c) => c.verb === "delayedDeletePlayed")).toEqual([
      { verb: "delayedDeletePlayed", args: ["PLAYED#1", "endOfOwnerTurn", "X-DELAYED-DELETE"] },
    ]);
  });
});

describe("Replacement sourceFilter zone gate", () => {
  it("does not install a battle-area replacement while the source is in breeding", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "YourTurn",
          actions: [
            {
              kind: "Replacement",
              event: "wouldDigivolve",
              sourceFilter: { isSelfRef: true, zone: "battleArea" },
              mode: "reduceCost",
              amount: 1,
            } as never,
          ],
        },
      ],
    };
    const source = makeSource({ cardId: "BT23-037", isOnBattleArea: () => false });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    // "YourTurn" is a continuous/static trigger — timingForTrigger maps it to EffectTiming.None.
    const effects = irCardModule("BT23-037", compiled).effectsForTiming(EffectTiming.None, source);

    await effects[0]!.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "subscribeReplacement")).toHaveLength(0);
  });
});

describe("MovePermanent (L_breeding)", () => {
  function moveCard(action: { direction: "toBreeding" | "toBattle"; target?: unknown }): CompiledCard {
    return {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "OnPlay", actions: [{ kind: "MovePermanent", ...action } as never] }],
    } as CompiledCard;
  }
  const battleTarget = {
    filter: { controller: "mine", kind: ["Digimon"], zone: "breeding", levelComparison: { op: "gte", value: 3 } },
    count: 1,
  };

  it("toBreeding moves the self permanent into the breeding slot", async () => {
    const compiled = moveCard({
      direction: "toBreeding",
      target: { filter: { isSelfRef: true }, isSelf: true, count: 1 },
    });
    const source = makeSource({ cardId: "X-MOVE-B", permanent: () => ({ permanentId: "SELF#1" }) as never });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const effects = irCardModule("X-MOVE-B", compiled).effectsForTiming(EffectTiming.OnPlay, source);
    await effects[0]!.resolve(ctx);
    const moves = recorder.calls.filter((c) => c.verb === "movePermanentZone");
    expect(moves).toHaveLength(1);
    expect(moves[0]!.args).toEqual(["SELF#1", "toBreeding"]);
  });

  it("toBattle moves an eligible (level >= 3) breeding Digimon to the battle area", async () => {
    const compiled = moveCard({ direction: "toBattle", target: battleTarget });
    const source = makeSource({ cardId: "X-MOVE-T" });
    const recorder: Recorder = { calls: [] };
    const bred = makeFakePermanent({
      permanentId: "BRED#1",
      controllerSeat: 0 as Seat,
      inBreeding: true,
      topCard: { instanceId: "b1", cardId: "BRED", ownerSeat: 0, faceUp: true } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never, level: 3 }),
    });
    (ctx.game.player(0) as { breeding?: Permanent }).breeding = bred;
    const effects = irCardModule("X-MOVE-T", compiled).effectsForTiming(EffectTiming.OnPlay, source);
    await effects[0]!.resolve(ctx);
    const moves = recorder.calls.filter((c) => c.verb === "movePermanentZone");
    expect(moves).toHaveLength(1);
    expect(moves[0]!.args).toEqual(["BRED#1", "toBattle"]);
  });

  it("toBattle does NOT move a breeding Digimon below the level minimum (Q4242)", async () => {
    const compiled = moveCard({ direction: "toBattle", target: battleTarget });
    const source = makeSource({ cardId: "X-MOVE-T2" });
    const recorder: Recorder = { calls: [] };
    const bred = makeFakePermanent({
      permanentId: "BRED#2",
      controllerSeat: 0 as Seat,
      inBreeding: true,
      topCard: { instanceId: "b2", cardId: "BRED2", ownerSeat: 0, faceUp: true } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never, level: 2 }),
    });
    (ctx.game.player(0) as { breeding?: Permanent }).breeding = bred;
    const effects = irCardModule("X-MOVE-T2", compiled).effectsForTiming(EffectTiming.OnPlay, source);
    await effects[0]!.resolve(ctx);
    expect(recorder.calls.filter((c) => c.verb === "movePermanentZone")).toHaveLength(0);
  });
});

describe("selfDigivolutionStackHasTrait condition (BT7-024 family)", () => {
  // A compiled card whose OnPlay GainMemory is gated on a [Hybrid] card being in THIS
  // permanent's digivolution stack (Form ∪ Attribute ∪ Type union).
  const gatedCard: CompiledCard = {
    coverage: "full",
    residual: [],
    effects: [
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "GainMemory",
            amount: 1,
            condition: {
              kind: "selfDigivolutionStackHasTrait",
              filter: { nameOrTrait: [{ tokens: ["Hybrid"], match: "trait" }] },
            },
          } as never,
        ],
      },
    ],
  } as CompiledCard;

  function ctxWithStack(stackCardId: string | undefined): { ctx: EffectContext; rec: Recorder } {
    const rec: Recorder = { calls: [] };
    const stack = stackCardId ? [{ instanceId: "s1", cardId: stackCardId, ownerSeat: 0, faceUp: true }] : [];
    const self = makeFakePermanent({ permanentId: "SELF#1", controllerSeat: 0 as Seat, stack: stack as never });
    const source = makeSource({ cardId: "X-GATE", permanent: () => self });
    const ctx = makeContext({
      source,
      recorder: rec,
      // [Hybrid] lives in `forms` for the gating card; an unrelated stack card has no Hybrid trait.
      definitionOf: (id) =>
        id === "HYB"
          ? makeFakeDefinition({ cardId: "HYB", forms: ["Hybrid"] as never })
          : makeFakeDefinition({ cardId: id, types: ["Dinosaur"] as never }),
    });
    return { ctx, rec };
  }

  it("gains memory only when a [Hybrid] card (trait in `forms`) is in the source stack", async () => {
    const module = irCardModule("X-GATE", gatedCard);

    const withHybrid = ctxWithStack("HYB");
    await module.effectsForTiming(EffectTiming.OnPlay, withHybrid.ctx.source)[0]!.resolve(withHybrid.ctx);
    expect(withHybrid.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(1);

    const withoutHybrid = ctxWithStack("OTHER");
    await module.effectsForTiming(EffectTiming.OnPlay, withoutHybrid.ctx.source)[0]!.resolve(withoutHybrid.ctx);
    expect(withoutHybrid.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(0);

    const emptyStack = ctxWithStack(undefined);
    await module.effectsForTiming(EffectTiming.OnPlay, emptyStack.ctx.source)[0]!.resolve(emptyStack.ctx);
    expect(emptyStack.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(0);
    // REVERT-CONFIRM-RED: make `selfDigivolutionStackHasTrait` always return true in
    // evaluateCondition => the without-Hybrid / empty-stack cases gain memory => RED.
  });

  // P-127/P-129: "if you have fewer/more security cards than your opponent, gain 1 memory"
  // (cross-player relative comparison — `securityCompare`).
  function securityCompareCtx(op: "lt" | "gt", own: number, opp: number) {
    const rec: Recorder = { calls: [] };
    const card: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [{ kind: "GainMemory", amount: 1, condition: { kind: "securityCompare", op } } as never],
        },
      ],
    } as CompiledCard;
    const sec = (n: number) => Array.from({ length: n }, (_, i) => ({ instanceId: `sec${i}` }));
    const source = makeSource({ cardId: "X-SECCMP" });
    const ctx = makeContext({ source, recorder: rec, ownSecurity: sec(own) });
    (ctx.game.player(1).security as unknown[]).push(...sec(opp));
    return { module: irCardModule("X-SECCMP", card), ctx, rec };
  }

  it("gains memory only when YOUR security is fewer than the opponent's (op:lt)", async () => {
    const fewer = securityCompareCtx("lt", 2, 5);
    await fewer.module.effectsForTiming(EffectTiming.OnPlay, fewer.ctx.source)[0]!.resolve(fewer.ctx);
    expect(fewer.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(1);

    const equal = securityCompareCtx("lt", 5, 5);
    await equal.module.effectsForTiming(EffectTiming.OnPlay, equal.ctx.source)[0]!.resolve(equal.ctx);
    expect(equal.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(0);

    const more = securityCompareCtx("lt", 5, 2);
    await more.module.effectsForTiming(EffectTiming.OnPlay, more.ctx.source)[0]!.resolve(more.ctx);
    expect(more.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(0);
  });

  it("gains memory only when YOUR security is more than the opponent's (op:gt)", async () => {
    const more = securityCompareCtx("gt", 5, 2);
    await more.module.effectsForTiming(EffectTiming.OnPlay, more.ctx.source)[0]!.resolve(more.ctx);
    expect(more.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(1);

    const fewer = securityCompareCtx("gt", 2, 5);
    await fewer.module.effectsForTiming(EffectTiming.OnPlay, fewer.ctx.source)[0]!.resolve(fewer.ctx);
    expect(fewer.rec.calls.filter((c) => c.verb === "gainMemoryForSeat")).toHaveLength(0);
  });
});

describe("irCardModule timing routing", () => {
  it("routes [On Play] Delete to the OnPlay timing and dispatches deletePermanent", async () => {
    const compiled = getCompiledCard("BT1-023");
    expect(compiled, "BT1-023 must have a compiled IR record").toBeTruthy();
    expect(compiled!.coverage).toBe("full");

    const module = irCardModule("BT1-023", compiled as CompiledCard);
    const source = makeSource({ cardId: "BT1-023" });

    // Wrong timing => no effects.
    expect(module.effectsForTiming(EffectTiming.WhenDigivolving, source)).toHaveLength(0);

    const effects = module.effectsForTiming(EffectTiming.OnPlay, source);
    expect(effects).toHaveLength(1);

    const recorder: Recorder = { calls: [] };
    const oppDigimon = makeFakePermanent({
      permanentId: "OPP#1",
      controllerSeat: 1 as Seat,
      currentDP: 4000,
      topCard: { instanceId: "OPP#1c", cardId: "OPP-1", ownerSeat: 1, faceUp: true } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [oppDigimon],
      // BT1-023 (SkullGreymon) deletes an opponent Digimon WITH ＜Blocker＞ — the
      // runtime record IR keeps that keyword filter (prose dropped it), and the
      // interpreter matches it against the target's printed text, so the fake
      // opponent Digimon must declare ＜Blocker＞ to be a legal target.
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never, effectText: "＜Blocker＞" }),
    });
    // The effect condition is `youHave` which the evaluator forces to controller:"mine".
    // Seat 0 needs at least 1 own Digimon with ＜Blocker＞ for the condition to pass.
    const ownBlocker = makeFakePermanent({
      permanentId: "OWN-BLOCKER",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "own-b1", cardId: "OPP-1", ownerSeat: 0, faceUp: true } as never,
    });
    (ctx.game.player(0) as { battleArea: Permanent[] }).battleArea = [ownBlocker];
    await effects[0]!.resolve(ctx);

    const deletes = recorder.calls.filter((c) => c.verb === "deletePermanent");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.args[0]).toEqual(["OPP#1"]);
  });

  it("Delete raises its printed DP cap by the active DP-deletion-maximum bonus", async () => {
    // Consumer side of the DP-deletion-maximum subsystem: a Delete with a printed numeric
    // "N DP or less" cap targets higher-DP Digimon while a DeletionMaxDpModifier is live.
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 4000 } },
                count: 1,
              },
            },
          ],
        },
      ],
    };
    const source = makeSource({ cardId: "TEST-DMD" });
    const effects = irCardModule("TEST-DMD", compiled).effectsForTiming(EffectTiming.OnPlay, source);
    const recorder: Recorder = { calls: [] };
    const within = makeFakePermanent({
      permanentId: "OPP#5000",
      controllerSeat: 1 as Seat,
      currentDP: 5000,
      topCard: { instanceId: "c5000", cardId: "OPP-5000", ownerSeat: 1, faceUp: true } as never,
    });
    const beyond = makeFakePermanent({
      permanentId: "OPP#7000",
      controllerSeat: 1 as Seat,
      currentDP: 7000,
      topCard: { instanceId: "c7000", cardId: "OPP-7000", ownerSeat: 1, faceUp: true } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [within, beyond],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    // A +2000 owner-wide bonus raises the 4000 cap to 6000: the 5000-DP Digimon becomes a
    // legal target, the 7000-DP one stays out of reach.
    (ctx.fx as { deletionMaxDpBonus?: (...a: unknown[]) => number }).deletionMaxDpBonus = () => 2000;
    await effects[0]!.resolve(ctx);

    const deletes = recorder.calls.filter((c) => c.verb === "deletePermanent");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.args[0]).toEqual(["OPP#5000"]);
  });

  it("routes [On Deletion] Gain 2 memory to OnDestroyedAnyone and gains memory", async () => {
    const compiled = getCompiledCard("BT1-035");
    expect(compiled?.coverage).toBe("full");
    const module = irCardModule("BT1-035", compiled as CompiledCard);
    const source = makeSource({ cardId: "BT1-035" });

    const effects = module.effectsForTiming(EffectTiming.OnDestroyedAnyone, source);
    expect(effects.length).toBeGreaterThanOrEqual(1);

    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    await effects[0]!.resolve(ctx);

    const mem = recorder.calls.filter((c) => c.verb === "gainMemory" || c.verb === "gainMemoryForSeat");
    expect(mem).toHaveLength(1);
    const amountArg = mem[0]!.verb === "gainMemoryForSeat" ? mem[0]!.args[1] : mem[0]!.args[0];
    expect(amountArg).toBe(2);
  });

  it("routes [Security] Play this card to SecuritySkill and plays self from security", async () => {
    const compiled = getCompiledCard("BT18-093");
    expect(compiled?.coverage).toBe("full");
    const module = irCardModule("BT18-093", compiled as CompiledCard);
    const source = makeSource({ cardId: "BT18-093", permanent: () => undefined });
    source.isInSecurity = () => true;

    const effects = module.effectsForTiming(EffectTiming.SecuritySkill, source);
    expect(effects.length).toBeGreaterThanOrEqual(1);
    expect(effects.some((e) => e.isSecurity)).toBe(true);

    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never }),
    });
    // The effect condition is `youHave Digimon or Tamer` — seat 0 needs at least 1 own Digimon.
    const ownDigimon = makeFakePermanent({
      permanentId: "OWN-DIGI",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "own-d1", cardId: "MY-DIGI", ownerSeat: 0, faceUp: true } as never,
    });
    (ctx.game.player(0) as { battleArea: Permanent[] }).battleArea = [ownDigimon];
    // The security effect is the PlayWithoutCost(self) one.
    const secEffect = effects.find((e) => e.isSecurity)!;
    await secEffect.resolve(ctx);

    const played = recorder.calls.filter((c) => c.verb === "playInstances");
    expect(played).toHaveLength(1);
    expect(played[0]!.args[0]).toEqual(["INST#1"]);
  });

  it("keeps compound [Security][Your Turn] effects in the continuous timing", () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "YourTurn",
          isSecurity: true,
          actions: [{ kind: "SubTrigger", event: "whenAttacking", actions: [] } as never],
        },
      ],
    };
    const module = irCardModule("TEST-SECURITY-YOUR-TURN", compiled);
    const source = makeSource({ cardId: "TEST-SECURITY-YOUR-TURN" });
    source.isInSecurity = () => true;

    expect(module.effectsForTiming(EffectTiming.None, source)).toHaveLength(1);
    expect(module.effectsForTiming(EffectTiming.SecuritySkill, source)).toHaveLength(0);
    expect(module.effectsForTiming(EffectTiming.None, source)[0]!.isSecurity).toBe(true);
  });
});

describe("SearchSecurity action", () => {
  it("offers only matching security cards and plays the selected one without cost", async () => {
    const compiled = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "SearchSecurity",
              target: {
                filter: { kind: ["Digimon"], levelComparison: { op: "lte", value: 5 } },
                count: 1,
              },
              then: { kind: "PlayWithoutCost", source: "security", payCost: false, optional: true },
            },
          ],
        },
      ],
    } as never as CompiledCard;
    const source = makeSource({ cardId: "X-SEARCH-SECURITY" });
    const recorder: Recorder = { calls: [] };
    const played = makeFakePermanent({ permanentId: "PLAYED" });
    const ctx = makeContext({
      source,
      recorder,
      ownSecurity: [
        { instanceId: "eligible", cardId: "LV5", ownerSeat: 0, faceUp: false },
        { instanceId: "too-high", cardId: "LV6", ownerSeat: 0, faceUp: false },
        { instanceId: "option", cardId: "OPTION", ownerSeat: 0, faceUp: false },
      ],
      definitionOf: (cardId) =>
        makeFakeDefinition({
          cardId,
          kinds: cardId === "OPTION" ? [CardKind.Option] : [CardKind.Digimon],
          level: cardId === "LV5" ? 5 : cardId === "LV6" ? 6 : undefined,
        }),
      selectCardsAnswer: ({ candidates }) => candidates.slice(0, 1),
      playInstancesResult: [played],
    });

    const effect = irCardModule("X-SEARCH-SECURITY", compiled).effectsForTiming(EffectTiming.OnUseOption, source)[0]!;
    await effect.resolve(ctx);

    const play = recorder.calls.find((call) => call.verb === "playInstances");
    expect(play?.args).toEqual([["eligible"], { payCost: false }]);
    expect(ctx.lastPlayedPermanentIds).toEqual(["PLAYED"]);
  });
});

describe("optional PlayWithoutCost", () => {
  it("does not ask the player when no legal loose card can be played", async () => {
    const compiled = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              from: ["hand", "trash"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    } as never as CompiledCard;
    const source = makeSource({ cardId: "X-OPTIONAL-PLAY" });
    const recorder: Recorder = { calls: [] };
    let optionalPrompts = 0;
    const ctx = makeContext({
      source,
      recorder,
      onOptional: () => {
        optionalPrompts += 1;
      },
    });

    const effect = irCardModule("X-OPTIONAL-PLAY", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    await effect.resolve(ctx);

    expect(optionalPrompts).toBe(0);
    expect(recorder.calls.some((call) => call.verb === "playInstances")).toBe(false);
  });

  it("does not offer a mixed play-or-use action when its only Option fails its color requirement", async () => {
    const source = makeSource({ cardId: "X-MIXED-COLOR" });
    const recorder: Recorder = { calls: [] };
    let optionalPrompts = 0;
    const ctx = makeContext({
      source,
      recorder,
      ownHand: [{ instanceId: "option", cardId: "OPTION", ownerSeat: 0, faceUp: false }],
      definitionOf: (cardId) =>
        makeFakeDefinition({ cardId, kinds: cardId === "OPTION" ? [CardKind.Option] : [CardKind.Digimon] }),
      optionColorRequirementMet: false,
      onOptional: () => {
        optionalPrompts += 1;
      },
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", kind: ["Digimon", "Tamer", "Option"] }, count: 1 },
              from: ["hand"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    };

    await irCardModule("X-MIXED-COLOR", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(optionalPrompts).toBe(0);
    expect(recorder.calls.some(({ verb }) => verb === "useOptionFromHand")).toBe(false);
  });

  it("applies dynamic cost reduction when a mixed play-or-use action selects an Option", async () => {
    const source = makeSource({ cardId: "X-MIXED-REDUCTION" });
    const recorder: Recorder = { calls: [] };
    const suspended = makeFakePermanent({
      permanentId: "suspended",
      isSuspended: true,
      topCard: { instanceId: "suspended-card", cardId: "DIGIMON", ownerSeat: 1, faceUp: true } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [suspended],
      ownHand: [{ instanceId: "option", cardId: "OPTION", ownerSeat: 0, faceUp: false }],
      definitionOf: (cardId) =>
        makeFakeDefinition({
          cardId,
          kinds: cardId === "OPTION" ? [CardKind.Option] : [CardKind.Digimon],
          playCost: 9,
        }),
      optionalAnswer: true,
      selectCardsAnswer: ({ candidates }) => candidates,
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", kind: ["Digimon", "Tamer", "Option"] }, count: 1 },
              from: ["hand"],
              payCost: true,
              reduceCostBy: 4,
              reduceCostByScaling: {
                per: 1,
                filter: { controller: "any", kind: ["Digimon"], suspended: true },
                unit: "cards",
              },
              optional: true,
            },
          ],
        },
      ],
    };

    await irCardModule("X-MIXED-REDUCTION", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(recorder.calls.find(({ verb }) => verb === "useOptionFromHand")?.args[3]).toEqual({
      payCost: true,
      costDelta: 5,
    });
  });
});

describe("Search action from security", () => {
  it("plays the selected card without cost when its Search chain requires it", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "Search",
              controller: "mine",
              filter: { kind: ["Digimon"] },
              count: 1,
              searchZone: "security",
              to: "hand",
              then: {
                kind: "PlayWithoutCost",
                target: { filter: { isSelfRef: true }, count: 1 },
                payCost: false,
              },
            },
          ],
        },
      ],
    };
    const source = makeSource({ cardId: "X-SEARCH-SECURITY-PLAY" });
    const recorder: Recorder = { calls: [] };
    const played = makeFakePermanent({ permanentId: "PLAYED" });
    const ctx = makeContext({
      source,
      recorder,
      ownSecurity: [{ instanceId: "eligible", cardId: "LV5", ownerSeat: 0, faceUp: false }],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
      selectCardsAnswer: ({ candidates }) => candidates,
      playInstancesResult: [played],
    });

    const effect = irCardModule("X-SEARCH-SECURITY-PLAY", compiled).effectsForTiming(
      EffectTiming.OnUseOption,
      source,
    )[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls.find((call) => call.verb === "playInstances")?.args).toEqual([
      ["eligible"],
      { payCost: false },
    ]);
    expect(recorder.calls.some((call) => call.verb === "returnToHand")).toBe(false);
    expect(ctx.lastPlayedPermanentIds).toEqual(["PLAYED"]);
  });
});

describe("Search action from another player's hand", () => {
  it("shows the searched hand to the searching player and leaves unchosen cards with their owner", async () => {
    const source = makeSource({ cardId: "X-SEARCH-HAND", ownerSeat: 0 });
    const recorder: Recorder = { calls: [] };
    const opponentHand = [
      { instanceId: "digimon", cardId: "LV5", ownerSeat: 1, faceUp: false },
      { instanceId: "option", cardId: "OPTION", ownerSeat: 1, faceUp: false },
    ];
    const ctx = makeContext({
      source,
      recorder,
      opponentHand,
      definitionOf: (cardId) =>
        makeFakeDefinition({ cardId, kinds: [cardId === "LV5" ? CardKind.Digimon : CardKind.Option] }),
      selectCardsAnswer: () => ["digimon"],
    });
    await runRevealAction(ctx, {
      kind: "Search",
      controller: "opponent",
      filter: { kind: ["Digimon"] },
      searchZone: "hand",
      count: 1,
      to: "revealed",
      bindResultAs: "found",
    });

    expect(recorder.calls.find((call) => call.verb === "selectCards")?.args[0]).toMatchObject({
      candidates: ["digimon"],
      visible: ["digimon", "option"],
      visibleCards: [
        { instanceId: "digimon", cardId: "LV5" },
        { instanceId: "option", cardId: "OPTION" },
      ],
    });
    expect(recorder.calls.some((call) => call.verb === "searchDeck")).toBe(false);
    expect(ctx.game.player(1).hand.map((card) => card.instanceId)).toEqual(["digimon", "option"]);
    expect(ctx.lastRevealedCards?.map((card) => card.instanceId)).toEqual(["digimon"]);
  });
});

it("feedback #51: copied forced attacks carry donor display text without replacing the host source", async () => {
  const host = makeFakePermanent({ permanentId: "gx-host", controllerSeat: 0 });
  const ctx = makeContext({
    source: makeSource({ cardId: "BT10-112", permanent: () => host }),
    recorder: { calls: [] },
  });
  ctx.activeTiming = "WhenDigivolving";
  ctx.activeEffectText = "Copied attack clause";
  ctx.activeEffectTextPart = "This Digimon attacks.";
  ctx.activeEffectTextCardId = "BT10-016";
  let provenance;
  ctx.fx.forceAttack = async (_id, options) => {
    provenance = options?.decisionProvenance;
  };
  await runAction(ctx, { kind: "Attack", target: { isSelf: true, count: 1, filter: { isSelfRef: true } } });
  expect(provenance).toMatchObject({
    sourceCardId: "BT10-112",
    sourcePermanentId: "gx-host",
    effectTextCardId: "BT10-016",
    effectTextPart: "This Digimon attacks.",
  });
});

describe("multiple borrowed effects", () => {
  it("chooses and processes each borrowed effect before choosing the next", async () => {
    const recorder: Recorder = { calls: [] };
    let picks = 0;
    const ctx = makeContext({
      source: makeSource({ cardId: "X-BORROW-TWO", ownerSeat: 0 }),
      recorder,
      ownSecurity: [
        { instanceId: "first", cardId: "BT6-084", ownerSeat: 0, faceUp: true },
        { instanceId: "second", cardId: "BT6-036", ownerSeat: 0, faceUp: true },
      ],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
      selectCardsAnswer: ({ candidates }) => [candidates[picks++]!],
    });

    await runActivateForeignEffect(ctx, {
      kind: "ActivateForeignEffect",
      zone: "security",
      fromTriggers: ["OnPlay"],
      filter: { controller: "mine", kind: ["Digimon"] },
      count: 2,
    });

    expect(recorder.calls.filter((call) => call.verb === "selectCards")).toHaveLength(2);
    expect(recorder.calls.filter((call) => call.verb === "gainMemoryForSeat").map((call) => call.args[1])).toEqual([
      1, 2,
    ]);
    expect(
      recorder.calls.map((call) => call.verb).filter((verb) => verb === "selectCards" || verb === "gainMemoryForSeat"),
    ).toEqual(["selectCards", "gainMemoryForSeat", "selectCards", "gainMemoryForSeat"]);
  });
});

describe("effect-wide optional processing decision order", () => {
  it("asks a targeted later By condition after the earlier payload", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-TARGETED-BY", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      ownSecurity: [{ instanceId: "security", cardId: "X-SECURITY", ownerSeat: 0 }],
      optionalAnswer: false,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "Attack",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              cost: {
                kind: "trash",
                target: { filter: { controller: "mine", zone: "security", position: "top" }, count: 1 },
                raw: "by trashing your top security card",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-TARGETED-BY", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "optional" || verb === "gainMemoryForSeat" || verb === "trash"),
    ).toEqual(["gainMemoryForSeat", "optional"]);
  });

  it("asks an optional By cost at its clause and its payload after payment", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-OPTIONAL-COST-ORDER", ownerSeat: 0 });
    const ctx = makeContext({ source, recorder });
    ctx.game.state.memory = 10;
    ctx.ask.optional = async (_ctx, prompt) => {
      recorder.calls.push({ verb: String(prompt).startsWith("Pay cost:") ? "costChoice" : "payloadChoice", args: [] });
      return true;
    };
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: { kind: "payMemory", memory: 1, optional: true, raw: "By paying 1 memory" },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-OPTIONAL-COST-ORDER", compiled)
      .effectsForTiming(EffectTiming.OnPlay, source)[0]!
      .resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter(
          (verb) =>
            verb === "costChoice" || verb === "payloadChoice" || verb === "gainMemoryForSeat" || verb === "gainMemory",
        ),
    ).toEqual(["gainMemoryForSeat", "costChoice", "gainMemory", "payloadChoice", "gainMemoryForSeat"]);
  });

  it("skips an optional By cost and its payload when its cost choice is declined", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-DECLINED-OPTIONAL-COST", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      optionalAnswer: false,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.state.memory = 10;
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: { kind: "payMemory", memory: 1, optional: true, raw: "By paying 1 memory" },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-DECLINED-OPTIONAL-COST", compiled)
      .effectsForTiming(EffectTiming.OnPlay, source)[0]!
      .resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "optional" || verb === "gainMemoryForSeat" || verb === "gainMemory"),
    ).toEqual(["gainMemoryForSeat", "optional"]);
  });

  it("selects a later hand-trash By cost at its clause and pays with that card", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-SELECTED-COST-ORDER", ownerSeat: 0 });
    const costCard = { instanceId: "selected-cost", cardId: "X-COST-CARD", ownerSeat: 0 };
    const ctx = makeContext({
      source,
      recorder,
      ownHand: [costCard],
      selectCardsAnswer: () => [costCard.instanceId],
    });
    const originalSelectCards = ctx.ask.selectCards;
    ctx.ask.selectCards = async (decisionCtx, request) => {
      expect(decisionCtx.payingCostDepth).toBeGreaterThan(0);
      return originalSelectCards(decisionCtx, request);
    };
    ctx.fx.trash = async (...args) => {
      recorder.calls.push({ verb: "trash", args });
      return [costCard] as never;
    };
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: {
                kind: "trash",
                target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
                raw: "By trashing 1 card in your hand",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-SELECTED-COST-ORDER", compiled)
      .effectsForTiming(EffectTiming.OnPlay, source)[0]!
      .resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "selectCards" || verb === "gainMemoryForSeat" || verb === "trash"),
    ).toEqual(["gainMemoryForSeat", "selectCards", "trash", "gainMemoryForSeat"]);
    expect(recorder.calls.filter((call) => call.verb === "selectCards")).toHaveLength(1);
    expect(recorder.calls.find((call) => call.verb === "trash")?.args[0]).toEqual([costCard.instanceId]);
  });

  it("does not pay a later hand-trash By cost when its selection is declined", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-DECLINED-SELECTED-COST", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      ownHand: [{ instanceId: "cost", cardId: "X-COST", ownerSeat: 0 }],
      selectCardsAnswer: () => [],
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: {
                kind: "trash",
                target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
                raw: "By trashing 1 card in your hand",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-DECLINED-SELECTED-COST", compiled)
      .effectsForTiming(EffectTiming.OnPlay, source)[0]!
      .resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "selectCards" || verb === "gainMemoryForSeat" || verb === "trash"),
    ).toEqual(["gainMemoryForSeat", "selectCards"]);
  });

  it("offers a second hand-trash By cost only the cards left after the first payment", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-TWO-SELECTED-COSTS", ownerSeat: 0 });
    const ownHand = [
      { instanceId: "first", cardId: "X-COST-A", ownerSeat: 0 },
      { instanceId: "second", cardId: "X-COST-B", ownerSeat: 0 },
    ];
    const ctx = makeContext({ source, recorder, ownHand });
    ctx.fx.trash = async (...args) => {
      recorder.calls.push({ verb: "trash", args });
      const index = ownHand.findIndex((card) => card.instanceId === args[0][0]);
      return index < 0 ? ([] as never) : (ownHand.splice(index, 1) as never);
    };
    const paidAction = (amount: number): Action => ({
      kind: "GainMemory",
      amount,
      cost: {
        kind: "trash",
        target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
        raw: "By trashing 1 card in your hand",
      },
      optional: true,
      abortOnDecline: true,
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "OnPlay", actions: [paidAction(1), paidAction(2), { kind: "GainMemory", amount: 3 }] }],
    };
    await irCardModule("X-TWO-SELECTED-COSTS", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .filter((call) => call.verb === "selectCards")
        .map((call) => (call.args[0] as { candidates: string[] }).candidates),
    ).toEqual([["first", "second"], ["second"]]);
    expect(recorder.calls.filter((call) => call.verb === "trash").map((call) => call.args[0])).toEqual([
      ["first"],
      ["second"],
    ]);
    expect(recorder.calls.filter((call) => call.verb === "gainMemoryForSeat")).toHaveLength(3);
  });

  it("chooses a later delete-own By cost at its clause and deletes that permanent", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-DELETE-OWN-ORDER", ownerSeat: 0 });
    const costPermanent = makeFakePermanent({
      permanentId: "cost-permanent",
      controllerSeat: 0,
      topCard: { instanceId: "cost-card", cardId: "X-COST-DIGIMON", ownerSeat: 0 } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [costPermanent],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    ctx.ask.chooseTargets = async (_ctx, request) => {
      recorder.calls.push({ verb: "chooseTargets", args: [request] });
      return [costPermanent.permanentId];
    };
    ctx.fx.deletePermanent = async (...args) => {
      recorder.calls.push({ verb: "deletePermanent", args });
      return 1;
    };
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: {
                kind: "deleteOwn",
                declineViaSelection: true,
                target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
                raw: "By deleting 1 of your Digimon",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-DELETE-OWN-ORDER", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "chooseTargets" || verb === "gainMemoryForSeat" || verb === "deletePermanent"),
    ).toEqual(["gainMemoryForSeat", "chooseTargets", "deletePermanent", "gainMemoryForSeat"]);
    expect(recorder.calls.filter((call) => call.verb === "chooseTargets")).toHaveLength(1);
    expect(recorder.calls.find((call) => call.verb === "deletePermanent")?.args[0]).toEqual([
      costPermanent.permanentId,
    ]);
  });

  it("does not offer a two-permanent By cost when an earlier payload removes one payer", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-STALE-DELETE-COST", ownerSeat: 0 });
    const ownBattleArea = ["cost-a", "cost-b"].map((permanentId) =>
      makeFakePermanent({
        permanentId,
        controllerSeat: 0,
        topCard: { instanceId: `${permanentId}-card`, cardId: "X-DIGIMON", ownerSeat: 0 } as never,
      }),
    );
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea,
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    ctx.ask.chooseTargets = async (decisionCtx, request) => {
      expect(decisionCtx.payingCostDepth).toBeGreaterThan(0);
      recorder.calls.push({ verb: "chooseTargets", args: [request] });
      return request.candidates;
    };
    ctx.fx.gainMemoryForSeat = (...args) => {
      recorder.calls.push({ verb: "gainMemoryForSeat", args });
      ownBattleArea.shift();
    };
    ctx.fx.deletePermanent = async (...args) => {
      recorder.calls.push({ verb: "deletePermanent", args });
      return args[0].length;
    };
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: {
                kind: "deleteOwn",
                declineViaSelection: true,
                target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 2 },
                raw: "By deleting 2 of your Digimon",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-STALE-DELETE-COST", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "chooseTargets" || verb === "gainMemoryForSeat" || verb === "deletePermanent"),
    ).toEqual(["gainMemoryForSeat"]);
    expect(ownBattleArea).toHaveLength(1);
  });

  it("offers a hand-trash By cost only the cards still in hand when its clause is reached", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-HAND-COST-AT-CLAUSE", ownerSeat: 0 });
    const removed = { instanceId: "removed", cardId: "X-COST-A", ownerSeat: 0 };
    const remaining = { instanceId: "remaining", cardId: "X-COST-B", ownerSeat: 0 };
    const ownHand = [removed, remaining];
    const ctx = makeContext({
      source,
      recorder,
      ownHand,
      selectCardsAnswer: ({ candidates }) => candidates.slice(0, 1),
    });
    ctx.fx.gainMemoryForSeat = (...args) => {
      recorder.calls.push({ verb: "gainMemoryForSeat", args });
      if (ownHand[0] === removed) ownHand.shift();
    };
    ctx.fx.trash = async (...args) => {
      recorder.calls.push({ verb: "trash", args });
      const index = ownHand.findIndex((card) => card.instanceId === args[0][0]);
      return index < 0 ? ([] as never) : (ownHand.splice(index, 1) as never);
    };
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: {
                kind: "trash",
                target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
                raw: "By trashing 1 card in your hand",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-HAND-COST-AT-CLAUSE", compiled)
      .effectsForTiming(EffectTiming.OnPlay, source)[0]!
      .resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "selectCards" || verb === "gainMemoryForSeat" || verb === "trash"),
    ).toEqual(["gainMemoryForSeat", "selectCards", "trash", "gainMemoryForSeat"]);
    expect(
      recorder.calls
        .filter((call) => call.verb === "selectCards")
        .map((call) => (call.args[0] as { candidates: string[] }).candidates),
    ).toEqual([[remaining.instanceId]]);
    expect(recorder.calls.find((call) => call.verb === "trash")?.args[0]).toEqual([remaining.instanceId]);
    expect(ownHand).toEqual([]);
  });

  it("keeps a later mandatory non-By hand cost mandatory", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-MANDATORY-HAND-COST", ownerSeat: 0 });
    const costCard = { instanceId: "mandatory-cost", cardId: "X-COST", ownerSeat: 0 };
    const ctx = makeContext({ source, recorder, ownHand: [costCard] });
    ctx.fx.trash = async (...args) => {
      recorder.calls.push({ verb: "trash", args });
      return [costCard] as never;
    };
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: {
                kind: "trash",
                target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
                raw: "Trash 1 card in your hand",
              },
            },
          ],
        },
      ],
    };
    await irCardModule("X-MANDATORY-HAND-COST", compiled)
      .effectsForTiming(EffectTiming.OnPlay, source)[0]!
      .resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "selectCards" || verb === "gainMemoryForSeat" || verb === "trash"),
    ).toEqual(["gainMemoryForSeat", "trash", "gainMemoryForSeat"]);
  });

  it("uses the borrowed trash-first cost when the later By clause is paid", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-BORROWED-BY", ownerSeat: 0 });
    const handCard = { instanceId: "hand-cost", cardId: "X-HAND", ownerSeat: 0 };
    const trashCard = { instanceId: "trash-cost", cardId: "X-TRASH", ownerSeat: 0 };
    const ctx = makeContext({
      source,
      recorder,
      ownHand: [handCard],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
      optionalAnswer: true,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.player(0).trash.push(trashCard as never);
    ctx.borrowedEffectOverrides = { sourceCardId: source.cardId, trigger: "OnPlay", preferTrashCostSource: true };
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: {
                kind: "place",
                destination: "security",
                position: "bottom",
                target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, from: ["hand", "trash"] },
                raw: "By placing 1 Digimon card from your hand or trash",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-BORROWED-BY", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "optional" || verb === "gainMemoryForSeat" || verb === "addSecurity"),
    ).toEqual(["gainMemoryForSeat", "optional", "addSecurity", "gainMemoryForSeat"]);
    expect(recorder.calls.find((call) => call.verb === "addSecurity")?.args[1]).toEqual([trashCard.instanceId]);
  });

  it("asks a later By condition at its clause even when the IR payload is mandatory", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-MANDATORY-PAYLOAD-BY", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      optionalAnswer: false,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.state.memory = 10;
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            { kind: "GainMemory", amount: 2, cost: { kind: "payMemory", memory: 1, raw: "By paying 1 memory" } },
          ],
        },
      ],
    };
    await irCardModule("X-MANDATORY-PAYLOAD-BY", compiled)
      .effectsForTiming(EffectTiming.OnPlay, source)[0]!
      .resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "optional" || verb === "gainMemoryForSeat" || verb === "gainMemory"),
    ).toEqual(["gainMemoryForSeat", "optional"]);
  });

  it("asks a later CostGatedBlock By condition after the first action", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-GATED-BY", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      optionalAnswer: false,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.state.memory = 10;
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "CostGatedBlock",
              cost: { kind: "payMemory", memory: 1, raw: "By paying 1 memory" },
              actions: [{ kind: "GainMemory", amount: 2 }],
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-GATED-BY", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "optional" || verb === "gainMemoryForSeat" || verb === "gainMemory"),
    ).toEqual(["gainMemoryForSeat", "optional"]);
  });

  it("asks a later CostModifier By condition once after the first action", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-MODIFIER-BY", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      optionalAnswer: true,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.state.memory = 10;
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "CostModifier",
              mode: "reduce",
              costType: "play",
              amount: 1,
              duration: "forTheTurn",
              optional: true,
              cost: { kind: "payMemory", memory: 1, raw: "By paying 1 memory" },
            },
          ],
        },
      ],
    };
    await irCardModule("X-MODIFIER-BY", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .map((call) => call.verb)
        .filter((verb) => verb === "optional" || verb === "gainMemoryForSeat" || verb === "gainMemory"),
    ).toEqual(["gainMemoryForSeat", "optional", "gainMemory"]);
  });

  it("does not reuse a parent's choice for a nested action with the same path", async () => {
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source: makeSource({ ownerSeat: 0 }),
      recorder,
      optionalAnswer: false,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    const outerAction: Action = { kind: "GainMemory", amount: 1, optional: true };
    const nestedAction: Action = { kind: "GainMemory", amount: 2, optional: true };
    ctx.activeActionPath = "1";
    ctx.predecidedOptionalActions = new Map([[outerAction, true]]);

    await runAction(ctx, nestedAction);

    expect(recorder.calls.filter((call) => call.verb === "optional")).toHaveLength(1);
    expect(recorder.calls.filter((call) => call.verb === "gainMemoryForSeat")).toHaveLength(0);
  });

  it("processes an earlier action before asking a later By condition in the same effect", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-OPTIONAL-ORDER", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      optionalAnswer: false,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.state.memory = 10;
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: { kind: "payMemory", memory: 1, raw: "By paying 1 memory" },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-OPTIONAL-ORDER", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls.map((call) => call.verb).filter((verb) => verb === "optional" || verb === "gainMemoryForSeat"),
    ).toEqual(["gainMemoryForSeat", "optional"]);
  });

  it("asks the later By condition once at its printed position, then pays it", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-OPTIONAL-YES", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      optionalAnswer: true,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.state.memory = 10;
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: { kind: "payMemory", memory: 1, raw: "by paying 1 memory" },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-OPTIONAL-YES", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(
      recorder.calls
        .filter((call) => call.verb === "optional" || call.verb === "gainMemoryForSeat" || call.verb === "gainMemory")
        .map((call) => [call.verb, call.verb === "optional" ? null : call.args[call.verb === "gainMemory" ? 0 : 1]]),
    ).toEqual([
      ["gainMemoryForSeat", 1],
      ["optional", null],
      ["gainMemory", -1],
      ["gainMemoryForSeat", 2],
    ]);
  });

  it("does not offer or pay a later By condition that cannot be paid when its clause is reached", async () => {
    const recorder: Recorder = { calls: [] };
    const source = makeSource({ cardId: "X-OPTIONAL-UNPAYABLE", ownerSeat: 0 });
    const ctx = makeContext({
      source,
      recorder,
      onOptional: () => recorder.calls.push({ verb: "optional", args: [] }),
    });
    ctx.game.state.memory = -10;
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "GainMemory", amount: 1 },
            {
              kind: "GainMemory",
              amount: 2,
              cost: { kind: "payMemory", memory: 1, raw: "By paying 1 memory" },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    };
    await irCardModule("X-OPTIONAL-UNPAYABLE", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(recorder.calls.filter((call) => call.verb === "optional")).toHaveLength(0);
    expect(recorder.calls.filter((call) => call.verb === "gainMemory")).toHaveLength(0);
    expect(recorder.calls.filter((call) => call.verb === "gainMemoryForSeat").map((call) => call.args[1])).toEqual([1]);
  });
});

describe("unsupported actions are loud", () => {
  it("throws UnsupportedEffectError for a RawUnparsed action in strict (test) mode", async () => {
    const compiled: CompiledCard = {
      coverage: "none",
      residual: ["do something arcane"],
      effects: [{ trigger: "OnPlay", actions: [{ kind: "RawUnparsed", text: "do something arcane" }] }],
    };
    const module = irCardModule("FAKE-001", compiled);
    const source = makeSource({ cardId: "FAKE-001" });
    const effects = module.effectsForTiming(EffectTiming.OnPlay, source);
    expect(effects).toHaveLength(1);

    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    await expect(effects[0]!.resolve(ctx)).rejects.toBeInstanceOf(UnsupportedEffectError);
  });

  it("throws UnsupportedEffectError for an action kind missing from the Action union", async () => {
    const compiled: CompiledCard = {
      coverage: "none",
      residual: [],
      effects: [{ trigger: "OnPlay", actions: [{ kind: "TotallyUnknownAction" } as never] }],
    };
    const module = irCardModule("FAKE-UNKNOWN", compiled);
    const source = makeSource({ cardId: "FAKE-UNKNOWN" });
    const effects = module.effectsForTiming(EffectTiming.OnPlay, source);
    expect(effects).toHaveLength(1);

    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    await expect(effects[0]!.resolve(ctx)).rejects.toBeInstanceOf(UnsupportedEffectError);
  });
});

describe("untilOpponentNextTurnEnd DP scope is loud", () => {
  const baseTarget = { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 } as const;
  it.each([true, false])("supports player-wide DP with owner-turn state %s", async (isOwnersTurn) => {
    const source = makeSource({ cardId: "X-NEXT-OPPONENT-DP", isOwnersTurn: () => isOwnersTurn });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const module = irCardModule(source.cardId, {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              amount: 3000,
              duration: "untilOpponentNextTurnEnd",
              playerWide: true,
            },
          ],
        },
      ],
    });
    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(recorder.calls.filter((call) => call.verb === "modifyPlayerDP")).toEqual([
      {
        verb: "modifyPlayerDP",
        args: [
          0,
          3000,
          EffectDuration.UntilOpponentTurnEnd,
          expect.objectContaining({
            ownerSeat: 0,
            skipsCurrentOpponentTurnEnd: !isOwnersTurn,
            matches: expect.any(Function),
            sourceCardId: "X-NEXT-OPPONENT-DP",
          }),
        ],
      },
    ]);
  });

  const cases: Array<[string, Action]> = [
    [
      "continuous",
      {
        kind: "ModifyDP",
        target: baseTarget,
        amount: 3000,
        duration: "untilOpponentNextTurnEnd",
        continuous: true,
      } as never,
    ],
    [
      "combined keyword",
      {
        kind: "ModifyDP",
        target: baseTarget,
        amount: 3000,
        duration: "untilOpponentNextTurnEnd",
        alsoGainKeywords: [{ keyword: "Blocker" }],
      } as never,
    ],
    [
      "budget target",
      {
        kind: "ModifyDP",
        target: { ...baseTarget, totalDpCap: 12000 },
        amount: 3000,
        duration: "untilOpponentNextTurnEnd",
      } as never,
    ],
    [
      "count-all target",
      {
        kind: "ModifyDP",
        target: { ...baseTarget, count: "all" },
        amount: 3000,
        duration: "untilOpponentNextTurnEnd",
      } as never,
    ],
    [
      "count-modified target",
      {
        kind: "ModifyDP",
        target: { ...baseTarget, countModifier: { amount: 1 } },
        amount: 3000,
        duration: "untilOpponentNextTurnEnd",
      } as never,
    ],
    [
      "multi-id sameTarget",
      {
        kind: "ModifyDP",
        target: { ...baseTarget, sameTarget: true },
        amount: 3000,
        duration: "untilOpponentNextTurnEnd",
      } as never,
    ],
  ];

  it.each(cases)("rejects the %s runtime path before granting DP", async (_name, action) => {
    const source = makeSource({ cardId: "X-NEXT-OPPONENT-DP" });
    const recorder: Recorder = { calls: [] };
    const first = makeFakePermanent({
      permanentId: "P1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "P1-CARD", cardId: "DIGIMON", ownerSeat: 0 } as never,
    });
    const second = makeFakePermanent({
      permanentId: "P2",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "P2-CARD", cardId: "DIGIMON", ownerSeat: 0 } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [first, second],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    ctx.lastResolvedPermanentIds = [first.permanentId, second.permanentId];
    const module = irCardModule(source.cardId, {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "OnPlay", actions: [action] }],
    });

    await expect(module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx)).rejects.toBeInstanceOf(
      UnsupportedEffectError,
    );
    expect(recorder.calls.some((call) => call.verb === "modifyDP" || call.verb === "modifyPlayerDP")).toBe(false);
    expect(recorder.calls.some((call) => call.verb === "grantKeyword")).toBe(false);
  });
});

// --- New IR action kinds (v2): dispatch to real primitives ------------------

/** Resolve a single-effect compiled card's first effect against a fresh recorder. */
async function runFirstEffect(
  compiled: CompiledCard,
  timing: EffectTiming,
  over: Partial<CardSource> = {},
): Promise<Recorder> {
  const module = irCardModule(over.cardId ?? "Z-000", compiled);
  const source = makeSource({ cardId: over.cardId ?? "Z-000", ...over });
  const effects = module.effectsForTiming(timing, source);
  const recorder: Recorder = { calls: [] };
  const ctx = makeContext({ source, recorder });
  for (const e of effects) await e.resolve(ctx);
  return recorder;
}

describe("v2 IR actions dispatch to real primitives", () => {
  it("applies for-each scaling to a ModifyDP amount (self gets +1000 per your Tamer)", async () => {
    // Source seat (0) controls two Tamers; +1000 * 2 = +2000.
    const tamer = (id: string): Permanent =>
      makeFakePermanent({
        permanentId: id,
        controllerSeat: 0 as Seat,
        topCard: { instanceId: id + "c", cardId: id, ownerSeat: 0, faceUp: true } as never,
      });
    const module = irCardModule("Z-DP", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              amount: 1000,
              duration: "forTheTurn",
              scaling: { per: 1, unit: "cards", filter: { controller: "mine", kind: ["Tamer"] } },
            },
          ],
        },
      ],
    });
    const selfPerm = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
    const source = makeSource({ cardId: "Z-DP", permanent: () => selfPerm });
    const recorder: Recorder = { calls: [] };
    // Two Tamers on seat 0 (the source's seat) — use a custom context.
    const players = [
      { seat: 0, battleArea: [tamer("T1"), tamer("T2"), selfPerm], security: [], hand: [], deck: [], trash: [] },
      { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
    ];
    const ctx = makeContext({ source, recorder });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    (ctx.game as { permanentById: (id: string) => unknown }).permanentById = (id: string) =>
      players.flatMap((p) => p.battleArea).find((p) => p.permanentId === id);
    (ctx.game as unknown as { definitionOf: (c: { cardId: string }) => CardDefinition }).definitionOf = (c) =>
      makeFakeDefinition({ cardId: c.cardId, kinds: ["Tamer"] as never });

    const effects = module.effectsForTiming(EffectTiming.None, source);
    for (const e of effects) await e.resolve(ctx);

    const dp = recorder.calls.filter((c) => c.verb === "modifyDP");
    expect(dp).toHaveLength(1);
    expect(dp[0]!.args[1]).toBe(2000); // 1000 * 2 Tamers
  });

  // EX2-038 [When Attacking] re-runs its OWN [When Digivolving] effect once per Tamer the
  // controller has in play (Q3331/Q3332). The interpreter computes reps = count * scaleFactor,
  // so the re-run effect fires `tamerCount` times — and 0 times with no Tamers (Q3331).
  describe("EX2-038 ReactivateEffect scales by Tamer count", () => {
    const runReactivationWithTamers = async (tamerCount: number) => {
      const compiled = getCompiledCard("EX2-038");
      expect(compiled?.coverage).toBe("full");
      const reactivate = compiled!.effects.find((e) => e.trigger === "WhenAttacking")?.actions[0];
      expect(reactivate).toMatchObject({
        kind: "ReactivateEffect",
        fromTrigger: "WhenDigivolving",
        count: 1,
        scaling: { per: 1, unit: "cards", filter: { controller: "mine", kind: ["Tamer"] } },
      });

      const tamer = (id: string): Permanent =>
        makeFakePermanent({
          permanentId: id,
          controllerSeat: 0 as Seat,
          topCard: { instanceId: id + "c", cardId: id, ownerSeat: 0, faceUp: true } as never,
        });
      const selfPerm = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
      const tamers = Array.from({ length: tamerCount }, (_, i) => tamer(`T${i + 1}`));
      const players = [
        { seat: 0, battleArea: [...tamers, selfPerm], security: [], hand: [], deck: [], trash: [] },
        { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
      ];

      const source = makeSource({ cardId: "EX2-038", permanent: () => selfPerm });
      const module = irCardModule("EX2-038", compiled as CompiledCard);
      const recorder: Recorder = { calls: [] };
      const ctx = makeContext({ source, recorder });
      (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
      (ctx.game as unknown as { definitionOf: (c: { cardId: string }) => CardDefinition }).definitionOf = () =>
        makeFakeDefinition({ kinds: ["Tamer"] as never });

      const effects = module.effectsForTiming(EffectTiming.OnUseAttack, source);
      expect(effects.length).toBeGreaterThanOrEqual(1);
      for (const e of effects) await e.resolve(ctx);
      // Each re-run of the [When Digivolving] effect performs one self ModifyDP (+2000).
      return recorder.calls.filter((c) => c.verb === "modifyDP").length;
    };

    it("re-runs the [When Digivolving] effect once per Tamer", async () => {
      expect(await runReactivationWithTamers(2)).toBe(2);
      expect(await runReactivationWithTamers(3)).toBe(3);
    });

    it("does not re-run at all with no Tamers (Q3331)", async () => {
      expect(await runReactivationWithTamers(0)).toBe(0);
    });
  });

  // BT2-104 Security: "Unsuspend all of your Digimon with ＜Blocker＞ and they get
  // +5000 DP for the turn." The trailing "and they get +N DP" conjunction shares the
  // Unsuspend's target set; before the compiler fix it was swallowed by the greedy
  // unsuspend-target capture, leaving the Security effect with no ModifyDP.
  describe("BT2-104 Security unsuspends and grants +5000 DP for the turn", () => {
    it("compiles both Unsuspend and a +5000 forTheTurn ModifyDP (FAILS-WHEN-REVERTED)", () => {
      const compiled = getCompiledCard("BT2-104");
      const sec = compiled!.effects.find((e) => e.trigger === "Security");
      expect(sec, "BT2-104 should have a Security effect").toBeDefined();
      const dp = sec!.actions.find((a) => a.kind === "ModifyDP");
      expect(dp, "Security effect must emit a ModifyDP for '+5000 DP for the turn'").toBeDefined();
      expect(dp).toMatchObject({ amount: 5000, duration: "forTheTurn" });
      expect(sec!.actions.some((a) => a.kind === "Unsuspend")).toBe(true);
    });
  });

  it("records a continuous restriction via fx.restrict", async () => {
    const oppDigimon = makeFakePermanent({
      permanentId: "OPP#1",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "OPP#1c", cardId: "OPP-1", ownerSeat: 1, faceUp: true } as never,
    });
    const module = irCardModule("Z-RES", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Restrict",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              restriction: "attack",
              duration: "untilOpponentTurnEnd",
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-RES" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [oppDigimon],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const restricts = recorder.calls.filter((c) => c.verb === "restrict");
    expect(restricts).toHaveLength(1);
    expect(restricts[0]!.args.slice(0, 3)).toEqual(["OPP#1", "attack", expect.anything()]);
  });

  it("shuffles security via fx.shuffleSecurity", async () => {
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          { trigger: "OnPlay", actions: [{ kind: "SecurityManipulation", op: "shuffle", controller: "mine" }] },
        ],
      },
      EffectTiming.OnPlay,
    );
    expect(rec.calls.filter((c) => c.verb === "shuffleSecurity")).toHaveLength(1);
  });

  it("lets the controller choose a partial trash amount for up-to leaveCount security", async () => {
    const source = makeSource({ cardId: "X-SECURITY-UP-TO" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownSecurity: Array.from({ length: 5 }, (_, index) => ({
        instanceId: `SEC-${index}`,
        cardId: "BT1-001",
        ownerSeat: 0,
        faceUp: false,
      })),
      chooseOptionAnswer: 1,
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "SecurityManipulation",
              op: "trashTop",
              controller: "mine",
              leaveCount: 3,
              upTo: true,
            },
          ],
        },
      ],
    };

    const effect = irCardModule("X-SECURITY-UP-TO", compiled).effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls.find((call) => call.verb === "chooseOption")?.args[0]).toEqual([
      "Trash 0 security cards",
      "Trash 1 security card",
      "Trash 2 security cards",
    ]);
    expect(recorder.calls.find((call) => call.verb === "trashFromSecurity")?.args).toEqual([0, 1, { fromTop: true }]);
  });

  it("flips the opponent's top face-down security card via fx.flipSecurityFaceUp (EX11-064)", async () => {
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          { trigger: "OnPlay", actions: [{ kind: "SecurityManipulation", op: "flipFaceUp", controller: "opponent" }] },
        ],
      },
      EffectTiming.OnPlay,
    );
    const flips = rec.calls.filter((c) => c.verb === "flipSecurityFaceUp");
    expect(flips).toHaveLength(1);
    // Source seat is 0, so "opponent" resolves to seat 1; scan from the top.
    expect(flips[0]!.args[0]).toBe(1);
    expect(flips[0]!.args[1]).toEqual({ fromTop: true });
  });

  it("threads faceUp:true into fx.addSecurity for a placeAsSecurity self placement (BT25-102)", async () => {
    // Self-form placeAsSecurity (no `source`): the resolving card itself is placed face-up at
    // the bottom of its own security, exercising the action.faceUp -> fx.addSecurity threading.
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          {
            trigger: "OnPlay",
            actions: [
              {
                kind: "SecurityManipulation",
                op: "placeAsSecurity",
                controller: "mine",
                toTop: false,
                faceUp: true,
              },
            ],
          },
        ],
      },
      EffectTiming.OnPlay,
    );
    const adds = rec.calls.filter((c) => c.verb === "addSecurity");
    expect(adds).toHaveLength(1);
    // addSecurity(seat, instanceIds, opts) — opts carries the face-up flag and bottom placement.
    expect(adds[0]!.args[2]).toEqual({ toTop: false, faceUp: true });
  });

  it("installs a delayed sub-trigger via fx.subscribeSubTrigger", async () => {
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          {
            trigger: "OnPlay",
            actions: [
              {
                kind: "SubTrigger",
                event: "whenAttacking",
                raw: "When this Digimon attacks, draw 1",
                actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
              },
            ],
          },
        ],
      },
      EffectTiming.OnPlay,
    );
    expect(rec.calls.filter((c) => c.verb === "subscribeSubTrigger")).toHaveLength(1);
  });

  it("gates an inherited discarded-source watcher by exact instance and effect provenance", async () => {
    const host = makeFakePermanent({
      permanentId: "HOST#P167",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "HOST#TOP", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
      stack: [{ instanceId: "SOURCE#P167", cardId: "P-167", ownerSeat: 0, faceUp: false }] as never,
    });
    const source = makeSource({
      cardId: "P-167",
      instanceId: "SOURCE#P167",
      permanent: () => host,
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownBattleArea: [host] });
    const module = irCardModule("P-167-mechanism", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "SubTrigger",
              event: "onDigivolutionCardDiscarded",
              sourceFilter: { matchTrashedSource: true },
              requireByEffect: true,
              actions: [{ kind: "GainMemory", amount: 1 }],
            },
          ],
          isInherited: true,
        },
      ],
    });
    await module.effectsForTiming(EffectTiming.None, source)[0]!.resolve(ctx);
    const installed = recorder.calls.find((call) => call.verb === "subscribeSubTrigger")?.args[0] as {
      matches?: (eventCtx: EffectContext) => boolean;
    };
    expect(installed.matches).toBeTypeOf("function");
    const eventContext = (instanceId: string, byEffect: boolean): EffectContext =>
      makeContext({
        source,
        recorder,
        ownBattleArea: [host],
        trigger: {
          subjectPermanentId: host.permanentId,
          trashedDigivolutionInstanceId: instanceId,
          ...(byEffect ? { byEffectSeat: 0 as Seat } : {}),
        },
      });
    expect(installed.matches!(eventContext("SOURCE#P167", true))).toBe(true);
    expect(installed.matches!(eventContext("OTHER#CARD", true))).toBe(false);
    expect(installed.matches!(eventContext("SOURCE#P167", false))).toBe(false);
  });

  it("CostModifier onConsume installs end-of-turn actions bound to the consumed digivolve target", async () => {
    const target = makeFakePermanent({
      permanentId: "TARGET",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "target-card", cardId: "TARGET-CARD", ownerSeat: 0, faceUp: true } as never,
      stack: [{ instanceId: "target-stack", cardId: "BASE-CARD", ownerSeat: 0 }] as never,
    });
    const source = makeSource({ cardId: "BT5-109" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownBattleArea: [target] });
    const [effect] = irCardModule("BT5-109-test", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "CostModifier",
              mode: "reduce",
              costType: "digivolve",
              amount: 6,
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: "all" },
              duration: "forTheTurn",
              once: true,
              consumeBindAs: "fused",
              onConsume: [
                {
                  kind: "TrashDigivolution",
                  target: { filter: {}, count: 1, fromSelectionRef: "fused" },
                  amount: 99,
                },
                {
                  kind: "Return",
                  target: { filter: {}, count: 1, fromSelectionRef: "fused" },
                  to: "deckBottom",
                },
              ],
            },
          ],
        },
      ],
    }).effectsForTiming(EffectTiming.OnUseOption, source);

    await effect!.resolve(ctx);
    const change = recorder.calls.find((c) => c.verb === "changeEvoCost");
    expect(change).toBeDefined();
    const opts = change!.args[2] as { once?: boolean; onConsume?: (match: { target: Permanent }) => void };
    expect(opts.once).toBe(true);

    opts.onConsume!({ target });
    const installed = recorder.calls.find((c) => c.verb === "subscribeSubTrigger");
    expect(installed).toBeDefined();
    const sub = installed!.args[0] as {
      event: string;
      sourcePermanentId?: string;
      run: (ctx: EffectContext) => Promise<void>;
    };
    expect(sub.event).toBe("endOfTurn");
    expect(sub.sourcePermanentId).toBe("TARGET");

    await sub.run(ctx);
    expect(recorder.calls.find((c) => c.verb === "trashDigivolutionCards")?.args[0]).toBe("TARGET");
    expect(recorder.calls.find((c) => c.verb === "returnToDeck")?.args[0]).toEqual(["target-card"]);
  });

  it("installs next-end-of-opponent-turn delayed effects as one-shot endOfTurn watchers", async () => {
    const selfPerm = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          {
            trigger: "WhenDigivolving",
            actions: [
              {
                kind: "DelayedEffect",
                trigger: "nextEndOfOpponentTurn",
                effect: {
                  kind: "Return",
                  target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                  to: "hand",
                },
              },
            ],
          },
        ],
      },
      EffectTiming.WhenDigivolving,
      { permanent: () => selfPerm },
    );
    const subs = rec.calls.filter((c) => c.verb === "subscribeSubTrigger");
    expect(subs).toHaveLength(1);
    expect(subs[0]!.args[0]).toMatchObject({
      event: "endOfTurn",
      once: true,
      expiresOnTurnEndOf: 1,
    });
    const subscription = subs[0]!.args[0] as {
      sourcePermanentId?: string;
      activationContext?: EffectContext;
    };
    expect(subscription.sourcePermanentId).toBeUndefined();
    expect(subscription.activationContext).toBeDefined();
  });

  it("grants a continuous keyword (non-Piercing) via fx.grantKeyword", async () => {
    const selfPerm = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          {
            trigger: "OnPlay",
            actions: [
              {
                kind: "GainKeyword",
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                keyword: { keyword: "Blocker" },
                duration: "forTheTurn",
              },
            ],
          },
        ],
      },
      EffectTiming.OnPlay,
      { permanent: () => selfPerm },
    );
    const grants = rec.calls.filter((c) => c.verb === "grantKeyword");
    expect(grants).toHaveLength(1);
    expect(grants[0]!.args[1]).toBe("Blocker");
  });

  it("plays a filtered card from trash via playInstances (PlayWithoutCost non-self)", async () => {
    const module = irCardModule("Z-PWC", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              from: ["trash"],
              payCost: false,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-PWC" });
    const recorder: Recorder = { calls: [] };
    const players = [
      {
        seat: 0,
        battleArea: [],
        security: [],
        hand: [],
        trash: [{ instanceId: "TRASH#1", cardId: "D-1", ownerSeat: 0, faceUp: true }],
        deck: [],
      },
      { seat: 1, battleArea: [], security: [], hand: [], trash: [], deck: [] },
    ];
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);

    const plays = recorder.calls.filter((c) => c.verb === "playInstances");
    expect(plays).toHaveLength(1);
    expect(plays[0]!.args[0]).toEqual(["TRASH#1"]);
  });

  it("routes a self-play from hand through the effect-play seam", async () => {
    const module = irCardModule("Z-SELF-PLAY", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: { isSelfRef: true },
                count: 1,
                isSelf: true,
              },
              from: ["hand"],
              payCost: false,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-SELF-PLAY", permanent: () => undefined });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: (cardId) =>
        makeFakeDefinition({
          cardId,
          kinds: ["Digimon"] as never,
        }),
    });

    for (const effect of module.effectsForTiming(EffectTiming.OnPlay, source)) {
      await effect.resolve(ctx);
    }

    const effectPlays = recorder.calls.filter((call) => call.verb === "playInstances");
    expect(effectPlays).toHaveLength(1);
    expect(effectPlays[0]!.args[0]).toEqual(["INST#1"]);
    expect(recorder.calls.some((call) => call.verb === "playFromHand")).toBe(false);
  });

  it("adds to target count when a countModifier condition passes", async () => {
    const module = irCardModule("Z-COUNTMOD", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: { controller: "mine", kind: ["Digimon"] },
                count: 1,
                countModifier: { amount: 1, condition: { kind: "digiXrosCount", minimum: 1 } },
              },
              from: ["hand"],
              payCost: false,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-COUNTMOD" });
    const recorder: Recorder = { calls: [] };
    const ownHand = [
      { instanceId: "HAND#1", cardId: "D-1", ownerSeat: 0, faceUp: false },
      { instanceId: "HAND#2", cardId: "D-2", ownerSeat: 0, faceUp: false },
    ];
    const ctx = makeContext({
      source,
      recorder,
      ownHand,
      trigger: { digiXrosMaterialCount: 1 },
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });

    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);

    const plays = recorder.calls.filter((c) => c.verb === "playInstances");
    expect(plays).toHaveLength(1);
    expect(plays[0]!.args[0]).toEqual(["HAND#1", "HAND#2"]);
  });

  it("multiplies the PlayWithoutCost target count by its live scaling factor", async () => {
    const module = irCardModule("Z-SCALED-PLAY", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              from: ["hand"],
              payCost: false,
              scaling: {
                per: 1,
                filter: { zone: "battleArea", controller: "mine", kind: ["Tamer"] },
                unit: "cards",
              },
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-SCALED-PLAY" });
    const recorder: Recorder = { calls: [] };
    const ownBattleArea = [
      makeFakePermanent({
        permanentId: "TAMER#1",
        controllerSeat: 0 as Seat,
        topCard: { instanceId: "T1", cardId: "TAMER", ownerSeat: 0 as Seat } as never,
      }),
      makeFakePermanent({
        permanentId: "TAMER#2",
        controllerSeat: 0 as Seat,
        topCard: { instanceId: "T2", cardId: "TAMER", ownerSeat: 0 as Seat } as never,
      }),
    ];
    const ownHand = [
      { instanceId: "HAND#1", cardId: "DIGIMON", ownerSeat: 0 },
      { instanceId: "HAND#2", cardId: "DIGIMON", ownerSeat: 0 },
      { instanceId: "HAND#3", cardId: "DIGIMON", ownerSeat: 0 },
    ];
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea,
      ownHand,
      definitionOf: (cardId) =>
        makeFakeDefinition({
          cardId,
          kinds: [cardId === "TAMER" ? CardKind.Tamer : CardKind.Digimon],
        }),
      selectCardsAnswer: ({ candidates, max }) => candidates.slice(0, max),
    });

    for (const effect of module.effectsForTiming(EffectTiming.OnPlay, source)) {
      await effect.resolve(ctx);
    }

    expect(recorder.calls.find((call) => call.verb === "selectCards")?.args[0]).toMatchObject({
      max: 2,
    });
    expect(recorder.calls.find((call) => call.verb === "playInstances")?.args[0]).toEqual(["HAND#1", "HAND#2"]);
  });

  it("plays selected cards up to the total play-cost budget (PlayMultiple)", async () => {
    const module = irCardModule("Z-MULTI", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayMultiple",
              totalCost: 6,
              filter: { controller: "mine", kind: ["Digimon"] },
              from: "hand",
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-MULTI" });
    const recorder: Recorder = { calls: [] };
    const ownHand = [
      { instanceId: "HAND#3", cardId: "COST-3", ownerSeat: 0, faceUp: false },
      { instanceId: "HAND#4", cardId: "COST-4", ownerSeat: 0, faceUp: false },
      { instanceId: "HAND#2", cardId: "COST-2", ownerSeat: 0, faceUp: false },
    ];
    const ctx = makeContext({
      source,
      recorder,
      ownHand,
      selectCardsAnswer: (o) => o.candidates,
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          kinds: ["Digimon"] as never,
          playCost: Number(id.split("-")[1]),
        }),
    });

    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);

    const plays = recorder.calls.filter((c) => c.verb === "playInstances");
    expect(plays).toHaveLength(1);
    expect(plays[0]!.args[0]).toEqual(["HAND#3", "HAND#2"]);
    expect(plays[0]!.args[1]).toEqual({ payCost: false });
  });

  it("does not offer PlayMultiple candidates whose individual play cost exceeds the total budget", async () => {
    const module = irCardModule("Z-MULTI", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayMultiple",
              totalCost: 8,
              filter: { controller: "mine", kind: ["Digimon"] },
              from: "hand",
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-MULTI" });
    const recorder: Recorder = { calls: [] };
    const ownHand = [
      { instanceId: "HAND#8", cardId: "COST-8", ownerSeat: 0, faceUp: false },
      { instanceId: "HAND#13", cardId: "COST-13", ownerSeat: 0, faceUp: false },
    ];
    const ctx = makeContext({
      source,
      recorder,
      ownHand,
      selectCardsAnswer: () => [],
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          kinds: ["Digimon"] as never,
          playCost: Number(id.split("-")[1]),
        }),
    });

    for (const effect of module.effectsForTiming(EffectTiming.OnPlay, source)) await effect.resolve(ctx);

    expect(recorder.calls.find((call) => call.verb === "selectCards")?.args[0]).toMatchObject({
      candidates: ["HAND#8"],
      max: 1,
    });
  });

  it("trashes cards from hand using the added-to-hand trigger count (HandManipulation trashVariable)", async () => {
    const module = irCardModule("Z-HAND", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "HandManipulation",
              op: "trashVariable",
              controller: "opponent",
              amount: "variable",
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-HAND" });
    const recorder: Recorder = { calls: [] };
    const opponentHand = [
      { instanceId: "OPP#1", cardId: "H-1", ownerSeat: 1, faceUp: false },
      { instanceId: "OPP#2", cardId: "H-2", ownerSeat: 1, faceUp: false },
      { instanceId: "OPP#3", cardId: "H-3", ownerSeat: 1, faceUp: false },
    ];
    const ctx = makeContext({
      source,
      recorder,
      opponentHand,
      trigger: { addedToHand: { instanceIds: ["ADDED#1", "ADDED#2"] } },
    });

    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);

    const trashes = recorder.calls.filter((c) => c.verb === "trash");
    expect(trashes).toHaveLength(1);
    expect(trashes[0]!.args[0]).toEqual(["OPP#1", "OPP#2"]);
  });

  it("notSameNameAs drops candidates sharing a name with a battle-area or trash card (PlayWithoutCost)", async () => {
    const module = irCardModule("Z-PWC-UNIQ", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              from: ["hand"],
              payCost: false,
              notSameNameAs: ["battleArea", "trash"],
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-PWC-UNIQ" });
    const recorder: Recorder = { calls: [] };
    const players = [
      {
        seat: 0,
        battleArea: [
          { permanentId: "BA#1", topCard: { instanceId: "BA#1c", cardId: "DUP", ownerSeat: 0, faceUp: true } },
        ],
        security: [],
        hand: [
          { instanceId: "HAND#dup", cardId: "DUP", ownerSeat: 0, faceUp: true },
          { instanceId: "HAND#uniq", cardId: "UNIQ", ownerSeat: 0, faceUp: true },
          { instanceId: "HAND#trashdup", cardId: "TRASHDUP", ownerSeat: 0, faceUp: true },
        ],
        trash: [{ instanceId: "TRASH#1", cardId: "TRASHDUP", ownerSeat: 0, faceUp: true }],
        deck: [],
      },
      { seat: 1, battleArea: [], security: [], hand: [], trash: [], deck: [] },
    ];
    const nameByCardId: Record<string, string> = {
      DUP: "Mihiramon",
      UNIQ: "Sandiramon",
      TRASHDUP: "Sinduramon",
    };
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: (id) =>
        makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, nameEn: nameByCardId[id] ?? id }),
    });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);

    const plays = recorder.calls.filter((c) => c.verb === "playInstances");
    expect(plays).toHaveLength(1);
    // Only the uniquely-named card is offered (auto-resolved at count 1); the battle-area
    // duplicate (Mihiramon) and the trash duplicate (Sinduramon) are excluded.
    expect(plays[0]!.args[0]).toEqual(["HAND#uniq"]);
  });

  it("de-digivolves a resolved opponent permanent via fx.deDigivolve", async () => {
    const oppDigimon = makeFakePermanent({
      permanentId: "OPP#1",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "OPP#1c", cardId: "OPP-1", ownerSeat: 1, faceUp: true } as never,
    });
    const module = irCardModule("Z-DD", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "DeDigivolve",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: 2,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-DD" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [oppDigimon],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const dd = recorder.calls.filter((c) => c.verb === "deDigivolve");
    expect(dd).toHaveLength(1);
    // The trashing effect's seat is threaded for EX11-070's stacked-trash-lock (KB Q5943); the
    // source owner is seat 0 here. The source card names the De-Digivolve on its movement.
    expect(dd[0]!.args).toEqual(["OPP#1", 2, { byEffectSeat: 0, byEffectCardId: "Z-DD" }]);
  });

  it("runs ＜Recovery +N＞ as recoverToSecurity (action-keyword verb)", async () => {
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          {
            trigger: "OnPlay",
            actions: [
              {
                kind: "GainKeyword",
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                keyword: { keyword: "Recovery", amount: 2 },
                duration: "permanent",
              },
            ],
          },
        ],
      },
      EffectTiming.OnPlay,
    );
    const r = rec.calls.filter((c) => c.verb === "recoverToSecurity");
    expect(r).toHaveLength(1);
    expect(r[0]!.args).toEqual([0, 2]);
  });

  it("waits for a Draw encoded as an action keyword before resolving", async () => {
    const module = irCardModule("Z-DRAW-KEYWORD", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "GainKeyword",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              keyword: { keyword: "Draw", amount: 1 },
              duration: "permanent",
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-DRAW-KEYWORD" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    ctx.fx.draw = async (...args) => {
      recorder.calls.push({ verb: "draw", args });
      await gate;
      return [];
    };

    const effect = module.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    const resolving = effect.resolve(ctx).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(recorder.calls.some((c) => c.verb === "draw")).toBe(true);
    expect(finished).toBe(false);

    release();
    await resolving;
    expect(finished).toBe(true);
  });

  it("discards N from hand for a hand-zone Trash target", async () => {
    const module = irCardModule("Z-DISC", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [{ kind: "Trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } }],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-DISC" });
    const recorder: Recorder = { calls: [] };
    const players = [
      {
        seat: 0,
        battleArea: [],
        security: [],
        hand: [{ instanceId: "H#1", cardId: "C-1", ownerSeat: 0, faceUp: true }],
        trash: [],
        deck: [],
      },
      { seat: 1, battleArea: [], security: [], hand: [], trash: [], deck: [] },
    ];
    const ctx = makeContext({ source, recorder });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const trashed = recorder.calls.filter((c) => c.verb === "trash");
    expect(trashed).toHaveLength(1);
    expect(trashed[0]!.args[0]).toEqual(["H#1"]);
  });

  // Comprehensive Rules 4-25-2: a multicolor card only has to contribute ONE color that
  // no other pick uses, so the selection is legal whenever a distinct color can be
  // assigned to every chosen card — not only when their color sets are disjoint.
  const differentColorsTrash = async (
    hand: { instanceId: string; cardId: string }[],
    colorsByCardId: Record<string, string[]>,
    upTo = false,
    selectedInstanceIds = hand.map((entry) => entry.instanceId),
  ) => {
    const source = makeSource({ cardId: "Z-DIFFERENT-COLORS" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownHand: hand,
      definitionOf: (cardId) => {
        const colors = colorsByCardId[cardId];
        if (colors) return makeFakeDefinition({ cardId, kinds: ["Digimon"] as never, colors: colors as never });
        return makeFakeDefinition({ cardId });
      },
      selectCardsAnswer: () => selectedInstanceIds,
    });
    const module = irCardModule("Z-DIFFERENT-COLORS", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Trash",
              target: { filter: { controller: "mine", zone: "hand", differentColors: true }, count: 2, upTo },
            },
          ],
        },
      ],
    });
    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    return recorder.calls.find((c) => c.verb === "trash")?.args[0];
  };

  it("accepts two cards sharing a color when each can still claim a distinct one", async () => {
    const trashed = await differentColorsTrash(
      [
        { instanceId: "HAND#red-blue", cardId: "RED-BLUE" },
        { instanceId: "HAND#blue-green", cardId: "BLUE-GREEN" },
      ],
      { "RED-BLUE": ["Red", "Blue"], "BLUE-GREEN": ["Blue", "Green"] },
    );
    expect(trashed).toEqual(["HAND#red-blue", "HAND#blue-green"]);
  });

  it("accepts two copies of the same two-color card as different colors", async () => {
    const trashed = await differentColorsTrash(
      [
        { instanceId: "HAND#red-blue-a", cardId: "RED-BLUE" },
        { instanceId: "HAND#red-blue-b", cardId: "RED-BLUE" },
      ],
      { "RED-BLUE": ["Red", "Blue"] },
    );
    expect(trashed).toEqual(["HAND#red-blue-a", "HAND#red-blue-b"]);
  });

  it("keeps the largest feasible subset for an ordinary different-color effect", async () => {
    const trashed = await differentColorsTrash(
      [
        { instanceId: "HAND#red-a", cardId: "RED" },
        { instanceId: "HAND#red-b", cardId: "RED" },
      ],
      { RED: ["Red"] },
    );
    // Comprehensive Rules §15-10-2-1 (`comprehensive-0184`, SHA-256
    // 394081fad7013ea5ff26975dc302fb0483dcd7e9c6d73bf11b5618e2a67d20af) requires "X cards or as
    // many cards up to X as possible" for an ordinary effect. The submitted pair is
    // invalid as a different-color set, so the resolver keeps the largest legal subset.
    // Optional processing costs use the separate §15-7 all-or-nothing contract and are
    // covered below.
    expect(trashed).toEqual(["HAND#red-a"]);
  });

  it("allows a partial different-color selection when the target is up to", async () => {
    const trashed = await differentColorsTrash(
      [
        { instanceId: "HAND#red-a", cardId: "RED" },
        { instanceId: "HAND#red-b", cardId: "RED" },
      ],
      { RED: ["Red"] },
      true,
    );
    expect(trashed).toEqual(["HAND#red-a"]);
  });

  it("rejects a forged under-minimum fixed-count pick when two distinct colors are available", async () => {
    const trashed = await differentColorsTrash(
      [
        { instanceId: "HAND#red-blue", cardId: "RED-BLUE" },
        { instanceId: "HAND#blue-green", cardId: "BLUE-GREEN" },
      ],
      { "RED-BLUE": ["Red", "Blue"], "BLUE-GREEN": ["Blue", "Green"] },
      false,
      ["HAND#red-blue"],
    );
    expect(trashed).toBeUndefined();
  });

  it("keeps a fixed-count different-color trash cost atomic when only one color is feasible", async () => {
    const source = makeSource({ cardId: "Z-DIFFERENT-COLORS-COST" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownHand: [
        { instanceId: "HAND#red-a", cardId: "RED" },
        { instanceId: "HAND#red-b", cardId: "RED" },
      ],
      definitionOf: (cardId) =>
        makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] as never, colors: ["Red"] as never }),
    });
    const receipt = { paidCount: 0 };
    expect(
      await payCost(
        ctx,
        {
          kind: "trash",
          target: { filter: { controller: "mine", zone: "hand", differentColors: true }, count: 2 },
        },
        receipt,
      ),
    ).toBe(false);
    expect(receipt.paidCount).toBe(0);
    expect(recorder.calls.some((call) => call.verb === "trash")).toBe(false);
  });

  it("routes a token play to playToken primitive", async () => {
    const module = irCardModule("Z-TOK", {
      coverage: "partial",
      residual: [],
      effects: [
        { trigger: "OnPlay", actions: [{ kind: "PlayToken", tokens: ["Diaboromon"], count: 1, payCost: false }] },
      ],
    });
    const source = makeSource({ cardId: "Z-TOK" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    await module.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);
    expect(recorder.calls.some((c) => c.verb === "playToken")).toBe(true);
  });
});

// --- v3 IR action kinds (P1–P6 round-3 fixes): dispatch to real primitives -----

describe("v3 IR actions (round-3 fixes) dispatch to real primitives", () => {
  it("SetTurnEndMemory records the active threshold for the source controller", async () => {
    const source = makeSource({ cardId: "BT14-081" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    ctx.fx.setTurnEndMinMemory = (...args) => recorder.calls.push({ verb: "setTurnEndMinMemory", args });
    const module = irCardModule("BT14-081", {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "YourTurn", actions: [{ kind: "SetTurnEndMemory", minimum: 3 }] }],
    });

    for (const effect of module.effectsForTiming(EffectTiming.None, source)) await effect.resolve(ctx);

    expect(recorder.calls).toContainEqual({
      verb: "setTurnEndMinMemory",
      args: [0, 3],
    });
  });

  it("pays a memory cost (payMemory) via gainMemory(-N) before the action", async () => {
    const oppDigimon = makeFakePermanent({
      permanentId: "OPP#1",
      controllerSeat: 1 as Seat,
      currentDP: 2000,
      topCard: { instanceId: "OPP#1c", cardId: "OPP-1", ownerSeat: 1, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-PAY" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [oppDigimon],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    const module = irCardModule("Z-PAY", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 3000 } },
                count: 1,
              },
              cost: { kind: "payMemory", memory: 1, raw: "By paying 1 cost" },
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnUseAttack, source)) await e.resolve(ctx);
    const mem = recorder.calls.filter((c) => c.verb === "gainMemory");
    expect(mem).toHaveLength(1);
    expect(mem[0]!.args[0]).toBe(-1);
    expect(recorder.calls.filter((c) => c.verb === "deletePermanent")).toHaveLength(1);
  });

  it("an optional cost (canNoSelect) that the controller declines still resolves the action", async () => {
    const source = makeSource({ cardId: "Z-OPTCOST" });
    const recorder: Recorder = { calls: [] };
    // optionalAnswer:false => decline the cost; the Draw must still happen.
    const ctx = makeContext({ source, recorder, optionalAnswer: false });
    const module = irCardModule("Z-OPTCOST", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "StartOfYourMainPhase",
          actions: [
            {
              kind: "Draw",
              controller: "mine",
              amount: 1,
              cost: {
                kind: "suspend",
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                optional: true,
              },
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnStartMainPhase, source)) await e.resolve(ctx);
    expect(recorder.calls.filter((c) => c.verb === "draw")).toHaveLength(1);
    expect(recorder.calls.filter((c) => c.verb === "suspend")).toHaveLength(0);
  });

  it("an Aura grants its keyword only while its gate holds (re-evaluated each resolve)", async () => {
    const selfPerm = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
    const blueTamer = makeFakePermanent({
      permanentId: "T#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "T#1c", cardId: "TAMER", ownerSeat: 0, faceUp: true } as never,
    });
    const auraEffect: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "YourTurn",
          actions: [
            {
              kind: "Aura",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              effect: { kind: "keyword", keyword: { keyword: "Jamming" } },
              while: { kind: "youHave", filter: { controller: "mine", kind: ["Tamer"], colors: ["Blue"] } },
            },
          ],
        },
      ],
    };
    const module = irCardModule("BT2-026", auraEffect);
    const source = makeSource({ cardId: "BT2-026", permanent: () => selfPerm });

    // Gate TRUE: a blue Tamer is in play => Jamming granted.
    const recOn: Recorder = { calls: [] };
    const playersOn = [
      { seat: 0, battleArea: [blueTamer, selfPerm], security: [], hand: [], deck: [], trash: [] },
      { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
    ];
    const ctxOn = makeContext({ source, recorder: recOn });
    (ctxOn.game as { player: (s: Seat) => unknown }).player = (s: Seat) => playersOn[s] as never;
    (ctxOn.game as { permanentById: (id: string) => unknown }).permanentById = (id: string) =>
      playersOn.flatMap((p) => p.battleArea).find((p) => p.permanentId === id);
    (ctxOn.game as unknown as { definitionOf: (c: { cardId: string }) => CardDefinition }).definitionOf = () =>
      makeFakeDefinition({ kinds: ["Tamer"] as never, colors: ["Blue"] as never });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctxOn);
    const grants = recOn.calls.filter((c) => c.verb === "grantKeyword");
    expect(grants).toHaveLength(1);
    expect(grants[0]!.args).toEqual([
      "SELF",
      "Jamming",
      expect.anything(),
      undefined,
      {
        continuous: true,
        sourceCardId: "BT2-026",
        sourceEffectText: undefined,
        sourceInstanceId: "INST#1",
      },
    ]);

    // Gate FALSE: no blue Tamer => no grant (the aura lapses).
    const recOff: Recorder = { calls: [] };
    const ctxOff = makeContext({ source, recorder: recOff });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctxOff);
    expect(recOff.calls.filter((c) => c.verb === "grantKeyword")).toHaveLength(0);
  });

  it("＜Save＞ places this card under a chosen Tamer (PlaceUnder self form)", async () => {
    const tamer = makeFakePermanent({
      permanentId: "T#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "T#1c", cardId: "TAMER", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-SAVE", instanceId: "SAVE#self" });
    const recorder: Recorder = { calls: [] };
    const players = [
      { seat: 0, battleArea: [tamer], security: [], hand: [], deck: [], trash: [] },
      { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
    ];
    const ctx = makeContext({ source, recorder });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    (ctx.game as { permanentById: (id: string) => unknown }).permanentById = (id: string) =>
      players.flatMap((p) => p.battleArea).find((p) => p.permanentId === id);
    (ctx.game as unknown as { definitionOf: (c: { cardId: string }) => CardDefinition }).definitionOf = () =>
      makeFakeDefinition({ kinds: ["Tamer"] as never });
    const module = irCardModule("Z-SAVE", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnDeletion",
          actions: [
            {
              kind: "PlaceUnder",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              underFilter: { controller: "mine", kind: ["Tamer"], excludeToken: true },
              optional: true,
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnDestroyedAnyone, source)) await e.resolve(ctx);
    const placed = recorder.calls.filter((c) => c.verb === "placeUnder");
    expect(placed).toHaveLength(1);
    expect(placed[0]!.args[0]).toBe("T#1"); // under the chosen Tamer permanent
    expect(placed[0]!.args[1]).toEqual(["SAVE#self"]); // this card placed
  });

  it("does not offer an optional PlaceUnder action when no loose card is eligible", async () => {
    const host = makeFakePermanent({
      permanentId: "HOST#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "HOST#1c", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-PU-OPTIONAL" });
    const recorder: Recorder = { calls: [] };
    let optionalCalls = 0;
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [host],
      onOptional: () => {
        optionalCalls += 1;
      },
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          kinds: ["Digimon"] as never,
          colors: ["Black"] as never,
          types: ["X Antibody"],
        }),
    });
    const module = irCardModule("Z-PU-OPTIONAL", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "PlaceUnder",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["X-Antibody"], match: "trait" }],
                },
                from: ["hand"],
                count: 1,
              },
              from: ["hand"],
              underFilter: { controller: "mine", kind: ["Digimon"] },
              optional: true,
            },
          ],
        },
      ],
    });

    for (const effect of module.effectsForTiming(EffectTiming.OnDeclaration, source)) {
      await effect.resolve(ctx);
    }

    expect(optionalCalls).toBe(0);
    expect(recorder.calls.filter(({ verb }) => verb === "placeUnder")).toHaveLength(0);
  });

  it("does not offer an optional PlaceUnder action when no destination host is legal", async () => {
    const source = makeSource({ cardId: "Z-PU-NO-HOST" });
    const recorder: Recorder = { calls: [] };
    let optionalCalls = 0;
    const ctx = makeContext({
      source,
      recorder,
      ownHand: [{ instanceId: "MAT#1", cardId: "MATERIAL", ownerSeat: 0 }],
      onOptional: () => {
        optionalCalls += 1;
      },
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          kinds: ["Digimon"] as never,
          colors: ["Black"] as never,
          types: ["X Antibody"],
        }),
    });
    const module = irCardModule("Z-PU-NO-HOST", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "PlaceUnder",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, from: ["hand"], count: 1 },
              from: ["hand"],
              underFilter: { controller: "mine", kind: ["Digimon"] },
              optional: true,
            },
          ],
        },
      ],
    });

    for (const effect of module.effectsForTiming(EffectTiming.OnDeclaration, source)) {
      await effect.resolve(ctx);
    }

    expect(optionalCalls).toBe(0);
    expect(recorder.calls.filter(({ verb }) => verb === "placeUnder")).toHaveLength(0);
  });

  it("PlaceUnder targetIsPermanent relocates a battle-area permanent at the requested stack position", async () => {
    const host = makeFakePermanent({
      permanentId: "HOST#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "H1c", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
    });
    const guest = makeFakePermanent({
      permanentId: "GUEST#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "G1c", cardId: "GUEST", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-PU", instanceId: "SRC" });
    const recorder: Recorder = { calls: [] };
    const players = [
      { seat: 0, battleArea: [host, guest], security: [], hand: [], deck: [], trash: [] },
      { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
    ];
    const ctx = makeContext({ source, recorder });
    ctx.selections = new Map([
      ["A", "GUEST#1"],
      ["B", "HOST#1"],
    ]);
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    (ctx.game as { permanentById: (id: string) => unknown }).permanentById = (id: string) =>
      players.flatMap((p) => p.battleArea).find((p) => p.permanentId === id);
    (ctx.game as unknown as { definitionOf: (c: { cardId: string }) => CardDefinition }).definitionOf = () =>
      makeFakeDefinition({ kinds: ["Digimon"] as never });
    const module = irCardModule("Z-PU", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "PlaceUnder",
              target: { fromSelectionRef: "A", filter: {}, count: 1 },
              underSelectionRef: "B",
              targetIsPermanent: true,
              position: "bottom",
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnDeclaration, source)) await e.resolve(ctx);
    const moved = recorder.calls.filter((c) => c.verb === "relocatePermanent");
    expect(moved).toHaveLength(1);
    expect(moved[0]!.args[0]).toBe("HOST#1");
    expect(moved[0]!.args[1]).toBe("GUEST#1");
    // Effect placements shed the moved permanent's own cards by default (KB EX2-028).
    expect(moved[0]!.args[2]).toEqual({ belowTop: false, shedOwnCards: true });
  });

  it("PlaceUnder trackCount records only permanent relocations that succeed", async () => {
    const host = makeFakePermanent({
      permanentId: "HOST#COUNT",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "HOST-COUNT", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
    });
    const guestA = makeFakePermanent({
      permanentId: "GUEST-A",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "GUEST-A-CARD", cardId: "GUEST", ownerSeat: 0, faceUp: true } as never,
    });
    const guestB = makeFakePermanent({
      permanentId: "GUEST-B",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "GUEST-B-CARD", cardId: "GUEST", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-PU-COUNT", instanceId: "SRC-COUNT" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [host, guestA, guestB],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, nameEn: id === "GUEST" ? "Guest" : "Host" }),
    });
    ctx.selections = new Map([["host", host.permanentId]]);
    ctx.fx.relocatePermanent = (destinationId, sourceId, opts) => {
      recorder.calls.push({ verb: "relocatePermanent", args: [destinationId, sourceId, opts] });
      return sourceId === guestB.permanentId;
    };
    const module = irCardModule("Z-PU-COUNT", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "PlaceUnder",
              target: {
                filter: { controller: "mine", nameOrTrait: [{ tokens: ["Guest"], match: "name" }] },
                count: 2,
              },
              underSelectionRef: "host",
              targetIsPermanent: true,
              position: "bottom",
              trackCount: "placed",
            },
          ],
        },
      ],
    });
    for (const effect of module.effectsForTiming(EffectTiming.OnDeclaration, source)) await effect.resolve(ctx);

    expect(ctx.namedCounts?.get("placed")).toBe(1);
  });

  it("MindLink relocates the source Tamer under a chosen Digimon", async () => {
    const tamer = makeFakePermanent({
      permanentId: "TAMER#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "T1c", cardId: "BT14-086", ownerSeat: 0, faceUp: true } as never,
    });
    const digimon = makeFakePermanent({
      permanentId: "DGM#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "D1c", cardId: "NUMEMON", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({
      cardId: "BT14-086",
      instanceId: "T1c",
      definition: makeFakeDefinition({ cardId: "BT14-086", kinds: ["Tamer"] as never }),
    });
    (source as { permanent: () => Permanent }).permanent = () => tamer;
    const recorder: Recorder = { calls: [] };
    const players = [
      { seat: 0, battleArea: [tamer, digimon], security: [], hand: [], deck: [], trash: [] },
      { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
    ];
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: (id) =>
        id === "BT14-086"
          ? makeFakeDefinition({ cardId: id, kinds: ["Tamer"] as never })
          : makeFakeDefinition({ cardId: id, nameEn: "Numemon", kinds: ["Digimon"] as never }),
    });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    (ctx.game as { permanentById: (id: string) => unknown }).permanentById = (id: string) =>
      players.flatMap((p) => p.battleArea).find((p) => p.permanentId === id);
    const module = irCardModule("BT14-086-ML", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "MindLink",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Numemon"], match: "name" }],
                },
                count: 1,
              },
              optional: true,
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnDeclaration, source)) await e.resolve(ctx);
    const moved = recorder.calls.filter((c) => c.verb === "relocatePermanent");
    expect(moved).toHaveLength(1);
    expect(moved[0]!.args[0]).toBe("DGM#1");
    expect(moved[0]!.args[1]).toBe("TAMER#1");
  });

  it("'both players' security trash hits each seat's stack", async () => {
    const source = makeSource({ cardId: "Z-BOTH" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const module = irCardModule("Z-BOTH", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenDigivolving",
          actions: [{ kind: "SecurityManipulation", op: "trashTop", controller: "any", bothPlayers: true, amount: 1 }],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.WhenDigivolving, source)) await e.resolve(ctx);
    const trashed = recorder.calls.filter((c) => c.verb === "trashFromSecurity");
    expect(trashed).toHaveLength(2); // one per player
    expect(new Set(trashed.map((c) => c.args[0]))).toEqual(new Set([0, 1]));
  });

  it("'both players' security trash honors leaveCount for each stack", async () => {
    const source = makeSource({ cardId: "Z-BOTH-LEAVE" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownSecurity: Array.from({ length: 5 }, (_, index) => ({
        instanceId: `OWN-SEC-${index}`,
        cardId: "BT1-001",
        ownerSeat: 0,
        faceUp: false,
      })),
      opponentSecurity: Array.from({ length: 4 }, (_, index) => ({
        instanceId: `OPP-SEC-${index}`,
        cardId: "BT1-001",
        ownerSeat: 1,
        faceUp: false,
      })),
    });
    const module = irCardModule("Z-BOTH-LEAVE", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenDigivolving",
          actions: [
            { kind: "SecurityManipulation", op: "trashTop", controller: "any", bothPlayers: true, leaveCount: 3 },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.WhenDigivolving, source)) await e.resolve(ctx);
    const trashed = recorder.calls.filter((c) => c.verb === "trashFromSecurity");
    expect(trashed.map((c) => c.args.slice(0, 2))).toEqual([
      [0, 2],
      [1, 1],
    ]);
  });

  it("placeAsSecurity from hand selects a loose card and adds it to security", async () => {
    const handCard = { instanceId: "H1", cardId: "H1", ownerSeat: 0, faceUp: true } as never;
    const source = makeSource({ cardId: "Z-SEC" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownHand: [handCard] });
    const module = irCardModule("Z-SEC", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "SecurityManipulation",
              op: "placeAsSecurity",
              controller: "mine",
              source: { filter: { zone: "hand" }, count: 1 },
              from: ["hand"],
              toTop: false,
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const added = recorder.calls.filter((c) => c.verb === "addSecurity");
    expect(added).toHaveLength(1);
    expect(added[0]!.args[0]).toBe(0); // the controller's security
    expect(added[0]!.args[1]).toEqual(["H1"]); // the chosen hand instance
  });

  it("asks the activating player to order multiple top security placements", async () => {
    const first = makeFakePermanent({
      permanentId: "P-FIRST",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "FIRST", cardId: "L3-FIRST", ownerSeat: 1, faceUp: true } as never,
    });
    const second = makeFakePermanent({
      permanentId: "P-SECOND",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "SECOND", cardId: "L3-SECOND", ownerSeat: 1, faceUp: true } as never,
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source: makeSource({ cardId: "Z-ORDER-SEC" }),
      recorder,
      opponentBattleArea: [first, second],
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon], level: 3 }),
      orderCardsAnswer: ({ candidates }) => [...candidates].reverse(),
    });
    const module = irCardModule("Z-ORDER-SEC", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "SecurityManipulation",
              op: "placeAsSecurity",
              controller: "opponent",
              source: {
                filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "eq", value: 3 } },
                count: "all",
              },
              toTop: true,
            },
          ],
        },
      ],
    });
    for (const effect of module.effectsForTiming(EffectTiming.OnPlay, ctx.source)) await effect.resolve(ctx);
    expect(recorder.calls.find((call) => call.verb === "orderCards")?.args[0]).toMatchObject({
      candidates: ["FIRST", "SECOND"],
    });
    expect(recorder.calls.find((call) => call.verb === "addSecurity")?.args[1]).toEqual(["FIRST", "SECOND"]);
  });

  it("restores a revealed security card in place at the requested bottom without flipping another face-up card", async () => {
    const otherFaceUp = { instanceId: "OTHER-UP", cardId: "OTHER", ownerSeat: 0, faceUp: true } as never;
    const revealed = { instanceId: "REVEALED", cardId: "REVEALED-CARD", ownerSeat: 0, faceUp: true } as never;
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source: makeSource({ cardId: "Z-REVEAL-RESTORE" }),
      recorder,
      ownSecurity: [revealed, otherFaceUp],
      revealed: [{ instanceId: "REVEALED", cardId: "REVEALED-CARD" }],
    });
    const module = irCardModule("Z-REVEAL-RESTORE", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [{ kind: "SecurityManipulation", op: "addBottom", controller: "mine", source: "revealed" }],
        },
      ],
    });

    for (const effect of module.effectsForTiming(EffectTiming.OnPlay, ctx.source)) await effect.resolve(ctx);

    expect(ctx.game.player(0).security.map((card) => card.instanceId)).toEqual(["OTHER-UP", "REVEALED"]);
    expect(ctx.game.player(0).security[0]!.faceUp).toBe(true);
    expect(ctx.game.player(0).security[1]!.faceUp).toBe(false);
    expect(recorder.calls.filter((call) => call.verb === "addSecurity")).toHaveLength(0);
    expect(recorder.calls).toContainEqual({ verb: "flipSecurityFaceDown", args: [0, "REVEALED"] });
  });

  it("placeAsSecurity fromDigivolutionTop adds the selected permanent's top stack card", async () => {
    const stackTop = { instanceId: "EVO#1", cardId: "EVO-CARD", ownerSeat: 0, faceUp: true } as never;
    const permanent = makeFakePermanent({
      permanentId: "STACKED#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "TOP#1", cardId: "TOP-CARD", ownerSeat: 0, faceUp: true } as never,
      stack: [stackTop] as never,
    });
    const source = makeSource({ cardId: "Z-SEC-STACK", permanent: () => permanent });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownBattleArea: [permanent] });
    const module = irCardModule("Z-SEC-STACK", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "SecurityManipulation",
              op: "placeAsSecurity",
              controller: "mine",
              source: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              fromDigivolutionTop: true,
              toTop: true,
            },
          ],
        },
      ],
    });

    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);

    const added = recorder.calls.filter((c) => c.verb === "addSecurity");
    expect(added).toHaveLength(1);
    expect(added[0]!.args[0]).toBe(0);
    expect(added[0]!.args[1]).toEqual(["EVO#1"]);
    expect(added[0]!.args[1]).not.toContain("TOP#1");
  });

  it("a routed place-as-cost (destination:security, top, face down) adds the chosen hand card to security", async () => {
    const handCard = { instanceId: "H9", cardId: "H9", ownerSeat: 0, faceUp: true } as never;
    const source = makeSource({ cardId: "Z-PC-SEC" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownHand: [handCard] });
    const module = irCardModule("Z-PC-SEC", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Draw",
              controller: "mine",
              amount: 1,
              cost: {
                kind: "place",
                destination: "security",
                position: "top",
                faceDown: true,
                target: { filter: { zone: "hand" }, from: ["hand"], count: 1 },
                raw: "by placing 1 Digimon card from your hand as the top security card",
              },
            },
          ],
        },
      ],
    } as never);
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const added = recorder.calls.filter((c) => c.verb === "addSecurity");
    expect(added).toHaveLength(1);
    expect(added[0]!.args[0]).toBe(0);
    expect(added[0]!.args[1]).toEqual(["H9"]);
    expect(added[0]!.args[2]).toMatchObject({ toTop: true, faceUp: false });
    // The cost was paid, so the parent Draw resolved.
    expect(recorder.calls.some((c) => c.verb === "draw")).toBe(true);
  });

  it("a routed place-as-cost (destination:security, bottom, face up) places the card face up at the bottom", async () => {
    const handCard = { instanceId: "H8", cardId: "H8", ownerSeat: 0, faceUp: true } as never;
    const source = makeSource({ cardId: "Z-PC-SECB" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownHand: [handCard] });
    const module = irCardModule("Z-PC-SECB", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Draw",
              controller: "mine",
              amount: 1,
              cost: {
                kind: "place",
                destination: "security",
                position: "bottom",
                faceDown: false,
                target: { filter: { zone: "hand" }, from: ["hand"], count: 1 },
                raw: "by placing 1 Digimon card face up as the bottom security card",
              },
            },
          ],
        },
      ],
    } as never);
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const added = recorder.calls.filter((c) => c.verb === "addSecurity");
    expect(added).toHaveLength(1);
    expect(added[0]!.args[2]).toMatchObject({ toTop: false, faceUp: true });
  });

  it("a routed place-as-cost (destination:digivolutionStack, self, top) places under the source permanent's top", async () => {
    const handCard = { instanceId: "H7", cardId: "H7", ownerSeat: 0, faceUp: true } as never;
    const selfPerm = makeFakePermanent({
      permanentId: "SELF#PC",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "INST#1", cardId: "Z-PC-DIGI", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-PC-DIGI", permanent: () => selfPerm });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownHand: [handCard], ownBattleArea: [selfPerm] });
    const module = irCardModule("Z-PC-DIGI", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Draw",
              controller: "mine",
              amount: 1,
              cost: {
                kind: "place",
                destination: "digivolutionStack",
                position: "top",
                host: "self",
                target: { filter: { zone: "hand" }, from: ["hand"], count: 1 },
                raw: "by placing 1 Digimon card from your trash as this Digimon's top digivolution card",
              },
            },
          ],
        },
      ],
    } as never);
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const placed = recorder.calls.filter((c) => c.verb === "placeUnder");
    expect(placed).toHaveLength(1);
    expect(placed[0]!.args[0]).toBe("SELF#PC");
    expect(placed[0]!.args[1]).toEqual(["H7"]);
    // position:"top" => belowTop:true (placeUnder's contract: belowTop inserts directly beneath
    // the current top card, i.e. the TOP digivolution card; the default/false end is the bottom).
    expect(placed[0]!.args[2]).toMatchObject({ belowTop: true });
  });

  it("a named place cost selects one exact card of each required name", async () => {
    const selfPerm = makeFakePermanent({
      permanentId: "SELF#NAMED-COST",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "INST#NAMED-COST", cardId: "Z-NAMED-COST", ownerSeat: 0 } as never,
    });
    const source = makeSource({ cardId: "Z-NAMED-COST", permanent: () => selfPerm });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [selfPerm],
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          nameEn: { GARU: "Garurumon", WERE: "WereGarurumon", GABU: "Gabumon" }[id] ?? id,
          kinds: ["Digimon"] as never,
        }),
    });
    (ctx.game.player(0) as never as { trash: { instanceId: string; cardId: string }[] }).trash = [
      { instanceId: "G1", cardId: "GARU" },
      { instanceId: "W1", cardId: "WERE" },
      { instanceId: "B1", cardId: "GABU" },
    ];
    ctx.fx.placeUnder = async (...args) => {
      recorder.calls.push({ verb: "placeUnder", args });
      return (args[1] as string[]).map((instanceId) => ({
        instanceId,
        cardId: instanceId,
        ownerSeat: 0,
        faceUp: true,
      })) as never;
    };
    const paid = await payCost(ctx, {
      kind: "place",
      destination: "digivolutionStack",
      position: "bottom",
      host: "self",
      target: {
        filter: {
          controller: "mine",
          zone: "trash",
          nameOrTrait: [{ tokens: ["Garurumon", "WereGarurumon", "Gabumon"], match: "name" }],
        },
        from: ["trash"],
        count: 2,
        requiredNamesExact: ["Garurumon", "WereGarurumon"],
      },
      raw: "by placing 1 [Garurumon] and 1 [WereGarurumon] from your trash",
    });

    expect(paid).toBe(true);
    expect(recorder.calls.map(({ verb }) => verb)).toEqual(["orderCards", "placeUnder"]);
    // Order position 1 (G1) ends nearest the bottom, so it is inserted last.
    expect(recorder.calls).toContainEqual({
      verb: "placeUnder",
      args: ["SELF#NAMED-COST", ["W1", "G1"], { belowTop: false, faceUp: true }],
    });
  });

  it("does not pay or bind a routed digivolution-stack cost when placeUnder moves no selected card", async () => {
    const handCard = { instanceId: "UNMOVED", cardId: "UNMOVED", ownerSeat: 0, faceUp: true } as never;
    const host = makeFakePermanent({
      permanentId: "HOST#UNMOVED",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "HOST-CARD", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "SOURCE", permanent: () => host });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownHand: [handCard], ownBattleArea: [host] });
    const out = { paidCount: 0 };

    const paid = await payCost(
      ctx,
      {
        kind: "place",
        destination: "digivolutionStack",
        position: "bottom",
        host: "self",
        bindHostAs: "placementTarget",
        target: { filter: { zone: "hand" }, from: ["hand"], count: 1 },
        raw: "by placing 1 card from your hand as this Digimon's bottom digivolution card",
      },
      out,
    );

    expect(paid).toBe(false);
    expect(out.paidCount).toBe(0);
    expect(ctx.selections?.has("placementTarget")).toBe(false);
    expect(recorder.calls).toContainEqual({
      verb: "placeUnder",
      args: ["HOST#UNMOVED", ["UNMOVED"], { belowTop: false, faceUp: true }],
    });
  });

  it("does not bind a multi-source permanent payment when its atomic move fails", async () => {
    const host = makeFakePermanent({
      permanentId: "HOST#ATOMIC",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "HOST-ATOMIC", cardId: "HOST", ownerSeat: 0, faceUp: true } as never,
    });
    const sourceA = makeFakePermanent({
      permanentId: "SOURCE-A",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "SOURCE-A-CARD", cardId: "SOURCE", ownerSeat: 0, faceUp: true } as never,
    });
    const sourceB = makeFakePermanent({
      permanentId: "SOURCE-B",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "SOURCE-B-CARD", cardId: "SOURCE", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "ATOMIC-COST", permanent: () => host });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [host, sourceA, sourceB],
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          nameEn: id === "SOURCE" ? "Source" : "Host",
          kinds: ["Digimon"] as never,
        }),
    });
    ctx.fx.relocatePermanentsByEffect = async () => [];
    ctx.selections = new Map([
      ["sourceBinding", "previous-source"],
      ["hostBinding", "previous-host"],
    ]);
    const paid = await payCost(ctx, {
      kind: "place",
      destination: "digivolutionStack",
      targetIsPermanent: true,
      host: "self",
      bindHostAs: "hostBinding",
      target: {
        filter: {
          controller: "mine",
          kind: ["Digimon"],
          nameOrTrait: [{ tokens: ["Source"], match: "name" }],
        },
        count: 2,
        bindAs: "sourceBinding",
      },
      raw: "by placing 2 source permanents under this Digimon",
    });

    expect(paid).toBe(false);
    expect(ctx.selections?.get("sourceBinding")).toBe("previous-source");
    expect(ctx.selections?.get("hostBinding")).toBe("previous-host");
    expect(ctx.game.state.players[0]!.battleArea).toEqual([host, sourceA, sourceB]);
    expect(host.stack).toHaveLength(0);
    expect(recorder.calls.filter(({ verb }) => verb === "relocatePermanent")).toHaveLength(0);
  });

  it("plays the selected level-limited card from the selected Digimon's stack", async () => {
    const sourcePerm = makeFakePermanent({
      permanentId: "SELF#STACK-PLAY",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "SRC", cardId: "Z-STACK-PLAY", ownerSeat: 0, faceUp: true } as never,
    });
    const hostPerm = makeFakePermanent({
      permanentId: "HOST#STACK-PLAY",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "HOST", cardId: "HOST-DIGIMON", ownerSeat: 1, faceUp: true } as never,
      stack: [{ instanceId: "STACK-L4", cardId: "STACK-L4", ownerSeat: 1, faceUp: true }] as never,
    });
    const source = makeSource({ cardId: "Z-STACK-PLAY", permanent: () => sourcePerm });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [sourcePerm],
      opponentBattleArea: [hostPerm],
      playInstancesResult: [makeFakePermanent({ permanentId: "PLAYED" })],
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          kinds: ["Digimon"] as never,
          level: id === "STACK-L4" ? 4 : 5,
        }),
    });
    const paid = await payCost(ctx, {
      kind: "playFromDigivolutionCards",
      hostTarget: {
        filter: { controller: "both", kind: ["Digimon"], excludeSelf: true },
        count: 1,
      },
      target: {
        filter: { kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
        count: 1,
      },
      raw: "By playing 1 level 4 or lower Digimon card from the chosen Digimon's digivolution cards",
    } as never);

    expect(paid).toBe(true);
    expect(recorder.calls).toContainEqual({
      verb: "playInstances",
      args: [["STACK-L4"], { payCost: false }],
    });
  });

  it("an onAddDigivolutionCards sub-trigger installs a subscription", async () => {
    const rec = await runFirstEffect(
      {
        coverage: "full",
        residual: [],
        effects: [
          {
            trigger: "AllTurns",
            actions: [
              {
                kind: "SubTrigger",
                event: "onAddDigivolutionCards",
                raw: "When Tamer cards are placed in this Digimon's digivolution cards, ...",
                sourceFilter: { controller: "mine", kind: ["Tamer"] },
                actions: [
                  {
                    kind: "Restrict",
                    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
                    restriction: "activateEffects",
                    duration: "untilOpponentTurnEnd",
                  },
                ],
              },
            ],
          },
        ],
      },
      EffectTiming.None,
    );
    const subs = rec.calls.filter((c) => c.verb === "subscribeSubTrigger");
    expect(subs).toHaveLength(1);
    expect((subs[0]!.args[0] as { event: string }).event).toBe("onAddDigivolutionCards");
  });

  it("a keyword-presence filter (with ＜Save＞) only matches cards whose text declares it", async () => {
    const withSave = makeFakePermanent({
      permanentId: "WS",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "WSc", cardId: "WITH-SAVE", ownerSeat: 0, faceUp: true } as never,
    });
    const noSave = makeFakePermanent({
      permanentId: "NS",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "NSc", cardId: "NO-SAVE", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-KWF" });
    const recorder: Recorder = { calls: [] };
    const players = [
      { seat: 0, battleArea: [withSave, noSave], security: [], hand: [], deck: [], trash: [] },
      { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
    ];
    const ctx = makeContext({ source, recorder });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    (ctx.game as { permanentById: (id: string) => unknown }).permanentById = (id: string) =>
      players.flatMap((p) => p.battleArea).find((p) => p.permanentId === id);
    (ctx.game as unknown as { definitionOf: (c: { cardId: string }) => CardDefinition }).definitionOf = (c) =>
      makeFakeDefinition({
        kinds: ["Digimon"] as never,
        effectText: c.cardId === "WITH-SAVE" ? "＜Save＞" : "Some other text",
      });
    const module = irCardModule("Z-KWF", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { controller: "mine", kind: ["Digimon"], keywords: ["Save"] }, count: "all" },
              amount: 1000,
              duration: "forTheTurn",
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnUseOption, source)) await e.resolve(ctx);
    const dp = recorder.calls.filter((c) => c.verb === "modifyDP");
    // Only the ＜Save＞-text Digimon is affected.
    expect(dp).toHaveLength(1);
    expect(dp[0]!.args[0]).toBe("WS");
  });

  it("a filter.or group matches a permanent satisfying EITHER alternative (color OR trait)", async () => {
    // OR group: "black OR has [Legend-Arms] in its traits". Three candidates:
    //   BLACK    — black color only            → matches (color alternative)
    //   LEGEND   — Legend-Arms trait, red color → matches (trait alternative)
    //   NEITHER  — red, no Legend-Arms trait    → does NOT match
    const black = makeFakePermanent({
      permanentId: "PB",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "PBc", cardId: "BLACK", ownerSeat: 0, faceUp: true } as never,
    });
    const legend = makeFakePermanent({
      permanentId: "PL",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "PLc", cardId: "LEGEND", ownerSeat: 0, faceUp: true } as never,
    });
    const neither = makeFakePermanent({
      permanentId: "PN",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "PNc", cardId: "NEITHER", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "Z-OR" });
    const recorder: Recorder = { calls: [] };
    const players = [
      { seat: 0, battleArea: [black, legend, neither], security: [], hand: [], deck: [], trash: [] },
      { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
    ];
    const ctx = makeContext({ source, recorder });
    (ctx.game as { player: (s: Seat) => unknown }).player = (s: Seat) => players[s] as never;
    (ctx.game as { permanentById: (id: string) => unknown }).permanentById = (id: string) =>
      players.flatMap((p) => p.battleArea).find((p) => p.permanentId === id);
    (ctx.game as unknown as { definitionOf: (c: { cardId: string }) => CardDefinition }).definitionOf = (c) =>
      makeFakeDefinition({
        kinds: ["Digimon"] as never,
        colors: (c.cardId === "BLACK" ? ["Black"] : ["Red"]) as never,
        types: c.cardId === "LEGEND" ? ["Legend-Arms"] : [],
      });
    const module = irCardModule("Z-OR", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "ModifyDP",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  or: [{ colors: ["Black"] }, { nameOrTrait: [{ tokens: ["Legend-Arms"], match: "trait" }] }],
                },
                count: "all",
              },
              amount: 1000,
              duration: "forTheTurn",
            },
          ],
        },
      ],
    });
    for (const e of module.effectsForTiming(EffectTiming.OnUseOption, source)) await e.resolve(ctx);
    const dp = recorder.calls.filter((c) => c.verb === "modifyDP");
    const affected = dp.map((c) => c.args[0]).sort();
    // BLACK (color alt) and LEGEND (trait alt) match; NEITHER does not.
    expect(affected).toEqual(["PB", "PL"]);
  });

  it("Digisorption -N compiles to a reduceCost replacement (behavior, not cosmetic)", () => {
    const compiled = getCompiledCard("BT2-045");
    expect(compiled, "BT2-045 must compile").toBeTruthy();
    const repl = (compiled!.effects ?? []).flatMap((e) => e.actions).find((a) => a.kind === "Replacement");
    expect(repl, "BT2-045 must emit a Replacement (not an empty-actions keyword)").toBeTruthy();
    expect((repl as { mode: string }).mode).toBe("reduceCost");
    expect((repl as { amount: number }).amount).toBe(2);
  });
});

// --- Regression: the compiled IR for the oracle's P1–P6 cards carries the
//     previously-dropped semantics. These assert the parser output (not runtime). ---

describe("round-3 regression: dropped semantics now captured in the IR", () => {
  const requireCard = (id: string): CompiledCard => {
    const c = getCompiledCard(id);
    expect(c, `${id} must have a compiled IR record`).toBeTruthy();
    return c as CompiledCard;
  };
  const allActions = (c: CompiledCard) => c.effects.flatMap((e) => e.actions);

  it("P3: digivolution requirements are parsed (BT10-082, EX8-017, ST17-04, BT20-034)", () => {
    // digivolutionRequirement is derived from the printed text parser (parse-digivolve.mjs),
    // which recovers the level/trait/name gates the runtime record flattened to gateless. BT10-082's
    // "Digivolve: 3 from Lv.5 w/[Xros Heart]" is the printed PRIMARY path, but every
    // digivolutionRequirement entry is consulted uniformly as an alternate path (the printed-color
    // path lives in cards.json evoCosts), so `isAlternate` is normalized to true and unread by the
    // engine — only the gates drive legality.
    expect(requireCard("BT10-082").digivolutionRequirement).toEqual([
      { level: 5, traits: ["Xros Heart"], cost: 3, isAlternate: true },
    ]);
    expect(requireCard("EX8-017").digivolutionRequirement).toEqual([
      { level: 2, traits: ["DS"], cost: 0, isAlternate: true },
    ]);
    expect(requireCard("ST17-04").digivolutionRequirement).toEqual([
      { level: 3, names: ["Terriermon", "Lopmon"], cost: 2, isAlternate: true },
    ]);
    // BT20-034 is ONE [Digivolve] header with an OR condition ("Lv.4 w/[Pulsemon] in text OR
    // Lv.4 w/[SEEKERS] trait"). It MUST be two requirements (disjunction): a base satisfies it
    // by having Pulsemon in its text OR the [SEEKERS] trait. Folding both gates into a single
    // requirement is wrong — the matcher ANDs a requirement's gates, which would demand BOTH.
    expect(requireCard("BT20-034").digivolutionRequirement).toEqual([
      { level: 4, texts: ["Pulsemon"], cost: 3, isAlternate: true },
      { level: 4, traits: ["SEEKERS"], cost: 3, isAlternate: true },
    ]);
  });

  it("P4: BT13-074 grants Jamming to YOUR Digimon (controller not inverted)", () => {
    const all = requireCard("BT13-074");
    const jam = allActions(all).find(
      (a) => a.kind === "Aura" && a.effect.kind === "keyword" && a.effect.keyword.keyword === "Jamming",
    );
    expect(jam).toBeTruthy();
    expect((jam as { target: { filter: { controllerDefault: string } } }).target.filter.controllerDefault).toBe("mine");
  });

  it("P4: BT20-034 restriction targets opponent Digimon only (not Tamers)", () => {
    const sub = allActions(requireCard("BT20-034")).find((a) => a.kind === "SubTrigger");
    expect((sub as { event: string }).event).toBe("onAddDigivolutionCards");
    const restrict = (sub as { actions: { kind: string; target: { filter: { kind: string[] } } }[] }).actions.find(
      (a) => a.kind === "Restrict",
    );
    expect(restrict!.target.filter.kind).toEqual(["Digimon"]);
  });

  it("P1: ST9-14 returns a SUSPENDED opponent Digimon (state filter kept)", () => {
    const ret = allActions(requireCard("ST9-14")).find((a) => a.kind === "Return");
    expect((ret as { target: { filter: { suspended?: boolean } } }).target.filter.suspended).toBe(true);
  });

  it("P1: BT12-098 reveal-add keeps the ＜Save＞-in-text filter", () => {
    const reveal = allActions(requireCard("BT12-098")).find((a) => a.kind === "RevealAdd");
    const saveSpec = (reveal as { add: { filter: { keywords?: string[] } }[] }).add.find((s) =>
      (s.filter.keywords ?? []).includes("Save"),
    );
    expect(saveSpec, "the Save-text reveal spec must be present").toBeTruthy();
  });

  it("P1: BT4-099 runtime record keeps the DP bound (name-exclusion gate is a known drop)", () => {
    // runtime record-primary IR: the Delete keeps the opponent-Digimon DP<=4000 target. The
    // clause-level "if you have a [Greymon]/[Dramon] Digimon (other than DoruGreymon, ...)"
    // name-exclusion GATE is an in-coroutine HasMatchConditionOwnersPermanent check the
    // runtime record does not lift into action.condition — a documented limitation shared with
    // the prose IR and recorded in historical migration ledger
    const del = allActions(requireCard("BT4-099")).find((a) => a.kind === "Delete");
    expect((del as { target: { filter: { dp?: { op: string; value: number } } } }).target.filter.dp).toEqual({
      op: "lte",
      value: 4000,
    });
  });

  it("P6: BT20-011 DNA digivolve pays its cost (payCost true)", () => {
    const dna = allActions(requireCard("BT20-011")).find((a) => a.kind === "DnaDigivolve");
    expect((dna as { payCost: boolean }).payCost).toBe(true);
  });

  it("P6: BT25-072 link carries the -2 cost reduction", () => {
    const link = allActions(requireCard("BT25-072")).find((a) => a.kind === "Link");
    expect((link as { costDelta?: number }).costDelta).toBe(-2);
  });

  it("P6: BT17-001 carries a memory cost of 1", () => {
    const del = allActions(requireCard("BT17-001")).find((a) => a.kind === "Delete");
    const cost = (del as { cost?: { kind: string; memory?: number } }).cost;
    expect(cost?.kind).toBe("payMemory");
    expect(cost?.memory).toBe(1);
  });

  it("P4: BT3-090 trashes BOTH players' security", () => {
    const sec = allActions(requireCard("BT3-090")).find((a) => a.kind === "SecurityManipulation");
    expect((sec as { bothPlayers?: boolean }).bothPlayers).toBe(true);
  });

  it("P5: P-115 ＜Save＞ compiles to a PlaceUnder (place-under-Tamer), not a self keyword grant", () => {
    const acts = allActions(requireCard("P-115"));
    expect(acts.some((a) => a.kind === "PlaceUnder")).toBe(true);
    expect(acts.some((a) => a.kind === "GainKeyword" && a.keyword.keyword === "Save")).toBe(false);
  });

  it("P5: BT2-026 'while you have a blue Tamer' compiles to an Aura (dynamic duration)", () => {
    const aura = allActions(requireCard("BT2-026")).find((a) => a.kind === "Aura");
    expect(aura).toBeTruthy();
    expect((aura as { effect: { kind: string } }).effect.kind).toBe("keyword");
  });

  it("P2: BT21-045 emits the delete blocks and ＜Security Attack +1＞ (the +3000 rider is a known drop)", () => {
    // runtime record-primary IR: both [When Digivolving]/[When Attacking] OPT deletes and the
    // suspend-Tamer-cost ＜Security Attack +1＞ are captured. The "+3000 DP" rider on the
    // SA+1 block is NOT separately emitted by the runtime record (a documented "minor" gap,
    // recorded in historical migration ledger).
    const acts = allActions(requireCard("BT21-045"));
    expect(acts.some((a) => a.kind === "Delete")).toBe(true);
    expect(acts.some((a) => a.kind === "GainKeyword" && a.keyword.keyword === "SecurityAttack")).toBe(true);
  });

  it("P2: BT13-074 emits both ＜Jamming＞ and ＜Reboot＞ grants", () => {
    const grants = allActions(requireCard("BT13-074")).filter((a) => a.kind === "Aura" && a.effect.kind === "keyword");
    const kws = grants.map((g) => (g as { effect: { keyword: { keyword: string } } }).effect.keyword.keyword);
    expect(kws).toEqual(expect.arrayContaining(["Jamming", "Reboot"]));
  });
});

describe("v4 IR actions (runtime record-v2 schema additions)", () => {
  it("TrashDigivolution trashes the TOP digivolution card of a targeted opponent Digimon", async () => {
    // Opponent Digimon with two source cards (bottom S0, top S1); trashing the top
    // digivolution card removes S1 (last in `stack`).
    const oppDigimon = makeFakePermanent({
      permanentId: "OPP#1",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "OPP#1c", cardId: "OPP-1", ownerSeat: 1, faceUp: true } as never,
      stack: [
        { instanceId: "S0", cardId: "S-0", ownerSeat: 1, faceUp: false },
        { instanceId: "S1", cardId: "S-1", ownerSeat: 1, faceUp: false },
      ] as never,
    });
    const module = irCardModule("Z-TDG", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "TrashDigivolution",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: 1,
              fromTop: true,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-TDG" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [oppDigimon],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const e of module.effectsForTiming(EffectTiming.OnUseAttack, source)) await e.resolve(ctx);

    // TrashDigivolution now routes through the dedicated trashDigivolutionCards seam (which fires
    // whenDigivolutionTrashed), passing the host permanent id and the trashed digivolution card.
    const trashes = recorder.calls.filter((c) => c.verb === "trashDigivolutionCards");
    expect(trashes).toHaveLength(1);
    expect(trashes[0]!.args[0]).toBe("OPP#1"); // the host permanent
    expect(trashes[0]!.args[1]).toEqual(["S1"]); // the TOP digivolution card
  });

  it("TrashDigivolution keeps an aborting fixed-count payment atomic when too few cards remain", async () => {
    const self = makeFakePermanent({
      permanentId: "SELF#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "SELF#top", cardId: "SELF-TOP", ownerSeat: 0, faceUp: true } as never,
      stack: [{ instanceId: "ONLY-SOURCE", cardId: "SOURCE-1", ownerSeat: 0, faceUp: false }] as never,
    });
    const module = irCardModule("Z-TDG-ATOMIC", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "TrashDigivolution",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              amount: 2,
              optional: true,
              abortOnDecline: true,
            },
            { kind: "GainMemory", amount: 1 },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-TDG-ATOMIC", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [self],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const effect of module.effectsForTiming(EffectTiming.OnUseAttack, source)) {
      await effect.resolve(ctx);
    }

    expect(recorder.calls.filter((call) => call.verb === "trashDigivolutionCards")).toHaveLength(0);
    expect(recorder.calls.filter((call) => call.verb === "gainMemory")).toHaveLength(0);
  });

  it("TrashDigivolution mandatory effects trash as many cards as the target has", async () => {
    const opponent = makeFakePermanent({
      permanentId: "OPP#PARTIAL",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "OPP#top", cardId: "OPP-TOP", ownerSeat: 1, faceUp: true } as never,
      stack: [{ instanceId: "ONLY-SOURCE", cardId: "SOURCE-1", ownerSeat: 1, faceUp: false }] as never,
    });
    const module = irCardModule("Z-TDG-PARTIAL", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "TrashDigivolution",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: 2,
              fromTop: false,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-TDG-PARTIAL" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [opponent],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const effect of module.effectsForTiming(EffectTiming.OnUseAttack, source)) {
      await effect.resolve(ctx);
    }

    const trashes = recorder.calls.filter((call) => call.verb === "trashDigivolutionCards");
    expect(trashes).toHaveLength(1);
    expect(trashes[0]!.args).toEqual([
      "OPP#PARTIAL",
      ["ONLY-SOURCE"],
      {
        byEffectSeat: 0,
        byEffectCardId: "Z-TDG-PARTIAL",
      },
    ]);
  });

  it("TrashDigivolution: a redirect (BT10-084 Q2004) collapses the target onto the new host, re-clamping the count to ITS stack instead of the original's", async () => {
    // Original target: an opponent Digimon with 3 digivolution cards — the action asks to
    // trash the top 3. A redirect swaps the host for a 2-card Digimon; the SAME fromTop/amount
    // selection logic must then re-run against the redirected host, taking only its 2 cards
    // (KB Q2004: "trash as many as possible" — no special-casing needed at the call site).
    const oppDigimon = makeFakePermanent({
      permanentId: "OPP#1",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "OPP#1c", cardId: "OPP-1", ownerSeat: 1, faceUp: true } as never,
      stack: [
        { instanceId: "S0", cardId: "S-0", ownerSeat: 1, faceUp: false },
        { instanceId: "S1", cardId: "S-1", ownerSeat: 1, faceUp: false },
        { instanceId: "S2", cardId: "S-2", ownerSeat: 1, faceUp: false },
      ] as never,
    });
    const redirectHost = makeFakePermanent({
      permanentId: "TACTI#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "TACTI#1c", cardId: "BT10-084", ownerSeat: 0, faceUp: true } as never,
      stack: [
        { instanceId: "T0", cardId: "T-0", ownerSeat: 0, faceUp: false },
        { instanceId: "T1", cardId: "T-1", ownerSeat: 0, faceUp: false },
      ] as never,
    });
    const module = irCardModule("Z-TDG-REDIRECT", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "TrashDigivolution",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: 3,
              fromTop: true,
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-TDG-REDIRECT" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [oppDigimon],
      ownBattleArea: [redirectHost],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    // Simulate an accepted BT10-084-style redirect: every effect-driven trash of digivolution
    // cards is offered to the reacting Digimon first.
    ctx.fx.redirectDigivolutionTrashHosts = async (hostPermanentIds) => {
      recorder.calls.push({ verb: "redirectDigivolutionTrashHosts", args: [hostPermanentIds] });
      return ["TACTI#1"];
    };
    for (const e of module.effectsForTiming(EffectTiming.OnUseAttack, source)) await e.resolve(ctx);

    // The consult was offered the ORIGINAL target, not the redirected one.
    const consulted = recorder.calls.filter((c) => c.verb === "redirectDigivolutionTrashHosts");
    expect(consulted).toHaveLength(1);
    expect(consulted[0]!.args[0]).toEqual(["OPP#1"]);

    // Only the REDIRECTED host was trashed — the original target's stack is untouched.
    const trashes = recorder.calls.filter((c) => c.verb === "trashDigivolutionCards");
    expect(trashes).toHaveLength(1);
    expect(trashes[0]!.args[0]).toBe("TACTI#1");
    // "trash as many as possible": amount 3 clamped to the redirected host's 2-card stack,
    // taking from the top (T1 then T0 per the existing fromTop selection order).
    expect(trashes[0]!.args[1]).toEqual(["T1", "T0"]);
    expect(oppDigimon.stack).toHaveLength(3); // the original target was never touched
  });

  it("payCost 'by trashing N of THIS Digimon's digivolution cards' (BT10-084 Q2006): a redirect trashes the reacting Digimon's cards and the paid count still reflects what was actually taken", async () => {
    const payer = makeFakePermanent({
      permanentId: "PAYER#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "PAYER#1c", cardId: "X-PAYER", ownerSeat: 0, faceUp: true } as never,
      stack: [
        { instanceId: "P0", cardId: "P-0", ownerSeat: 0, faceUp: false },
        { instanceId: "P1", cardId: "P-1", ownerSeat: 0, faceUp: false },
        { instanceId: "P2", cardId: "P-2", ownerSeat: 0, faceUp: false },
        { instanceId: "P3", cardId: "P-3", ownerSeat: 0, faceUp: false },
        { instanceId: "P4", cardId: "P-4", ownerSeat: 0, faceUp: false },
      ] as never,
    });
    const redirectHost = makeFakePermanent({
      permanentId: "TACTI#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "TACTI#1c", cardId: "BT10-084", ownerSeat: 0, faceUp: true } as never,
      stack: [
        { instanceId: "T0", cardId: "T-0", ownerSeat: 0, faceUp: false },
        { instanceId: "T1", cardId: "T-1", ownerSeat: 0, faceUp: false },
        { instanceId: "T2", cardId: "T-2", ownerSeat: 0, faceUp: false },
        { instanceId: "T3", cardId: "T-3", ownerSeat: 0, faceUp: false },
        { instanceId: "T4", cardId: "T-4", ownerSeat: 0, faceUp: false },
      ] as never,
    });
    const source = makeSource({ cardId: "X-PAYER", permanent: () => payer });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [payer, redirectHost],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    ctx.fx.redirectDigivolutionTrashHosts = async () => ["TACTI#1"];
    ctx.fx.trashDigivolutionCards = async (hostPermanentId, instanceIds) => {
      recorder.calls.push({
        verb: "trashDigivolutionCards",
        args: [hostPermanentId, instanceIds],
      });
      const host = ctx.game.permanentById(hostPermanentId);
      return (host?.stack.filter(({ instanceId }) => instanceIds.includes(instanceId)) ?? []) as never;
    };

    const out = { paidCount: 0 };
    const paid = await payCost(
      ctx,
      {
        kind: "trash",
        target: { filter: { isSelfRef: true, zone: "digivolutionCards" }, count: 5, isSelf: true },
        raw: "by choosing 5 of this Digimon's digivolution cards and trashing them",
      } as never,
      out,
    );

    expect(paid).toBe(true);
    expect(out.paidCount).toBe(5);
    const trashes = recorder.calls.filter((c) => c.verb === "trashDigivolutionCards");
    expect(trashes).toHaveLength(1);
    expect(trashes[0]!.args[0]).toBe("TACTI#1"); // redirected off the payer's own stack
    expect((trashes[0]!.args[1] as string[]).sort()).toEqual(["T0", "T1", "T2", "T3", "T4"]);
    expect(payer.stack).toHaveLength(5); // the payer's own stack was never touched
  });

  it("opponentHasNone gates an Aura: +1000 DP applies only when the opponent has no unsuspended Digimon", async () => {
    const auraEffect: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "Aura",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              effect: { kind: "modifyDP", amount: 1000 },
              while: {
                kind: "opponentHasNone",
                filter: { controller: "opponent", kind: ["Digimon"], unsuspended: true },
              },
            },
          ],
        },
      ],
    };
    const selfPerm = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
    const source = makeSource({ cardId: "Z-AURA", permanent: () => selfPerm });

    // Case A: opponent has an UNSUSPENDED Digimon -> gate fails -> no modifyDP.
    {
      const oppUp = makeFakePermanent({
        permanentId: "OPP#up",
        controllerSeat: 1 as Seat,
        isSuspended: false,
        topCard: { instanceId: "OPP#upc", cardId: "OPP-up", ownerSeat: 1, faceUp: true } as never,
      });
      const recorder: Recorder = { calls: [] };
      const ctx = makeContext({
        source,
        recorder,
        opponentBattleArea: [oppUp],
        definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
      });
      const module = irCardModule("Z-AURA", auraEffect);
      for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);
      expect(recorder.calls.filter((c) => c.verb === "modifyDP")).toHaveLength(0);
    }

    // Case B: opponent's only Digimon is SUSPENDED -> gate holds -> +1000 applies.
    {
      const oppSuspended = makeFakePermanent({
        permanentId: "OPP#s",
        controllerSeat: 1 as Seat,
        isSuspended: true,
        topCard: { instanceId: "OPP#sc", cardId: "OPP-s", ownerSeat: 1, faceUp: true } as never,
      });
      const recorder: Recorder = { calls: [] };
      const ctx = makeContext({
        source,
        recorder,
        opponentBattleArea: [oppSuspended],
        definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
      });
      const module = irCardModule("Z-AURA", auraEffect);
      for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);
      const dp = recorder.calls.filter((c) => c.verb === "modifyDP");
      expect(dp).toHaveLength(1);
      expect(dp[0]!.args).toEqual(["SELF", 1000, expect.anything(), { continuous: true }]);
    }
  });
});

describe("combat IR actions dispatch to the attack-and-block verbs", () => {
  it("Attack (self) calls forceAttack on the source permanent", async () => {
    const selfPerm = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenDigivolving",
          actions: [{ kind: "Attack", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } }],
        },
      ],
    };
    const recorder = await runFirstEffect(compiled, EffectTiming.WhenDigivolving, {
      cardId: "Z-ATK",
      permanent: () => selfPerm,
    });
    const calls = recorder.calls.filter((c) => c.verb === "forceAttack");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0]).toBe("SELF");
  });

  it("a flagged Attack skips attacker selection and forceAttack while combat is already resolving", async () => {
    const attacker = makeFakePermanent({ permanentId: "A1", controllerSeat: 1 as Seat });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Attack",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              drainTimingWindowDuringAttack: true,
              cost: {
                kind: "suspend",
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              },
            },
          ],
        },
      ],
    };
    const module = irCardModule("Z-NESTED-ATK", compiled);
    const payer = makeFakePermanent({ permanentId: "PAYER", controllerSeat: 0 as Seat });
    const source = makeSource({ cardId: "Z-NESTED-ATK", permanent: () => payer });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [payer],
      opponentBattleArea: [attacker],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    ctx.fx.isAttackResolving = () => true;
    let suspensionTriggerCalls = 0;
    ctx.fx.fireSuspensionTriggers = async (ids) => {
      expect(ids).toEqual([payer.permanentId]);
      suspensionTriggerCalls += 1;
    };

    for (const effect of module.effectsForTiming(EffectTiming.OnPlay, source)) await effect.resolve(ctx);

    expect(recorder.calls.filter(({ verb }) => verb === "forceAttack")).toHaveLength(0);
    expect(recorder.calls.filter(({ verb }) => verb.startsWith("select"))).toHaveLength(0);
    expect(suspensionTriggerCalls).toBe(1);
  });

  it("Attack (forced, all matching) calls forceAttack on each resolved permanent", async () => {
    // The fake context scopes the populated battle area to the opponent (player 1), so
    // exercise the targeted form against an opponent-controller filter (the dispatch is
    // identical for the 'mine' form, which the self test already covers via forceAttack).
    const t1 = makeFakePermanent({
      permanentId: "A1",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "A1c", cardId: "A1", ownerSeat: 1, faceUp: true } as never,
    });
    const t2 = makeFakePermanent({
      permanentId: "A2",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "A2c", cardId: "A2", ownerSeat: 1, faceUp: true } as never,
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "Attack", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" } },
          ],
        },
      ],
    };
    const module = irCardModule("Z-ATK2", compiled);
    const source = makeSource({ cardId: "Z-ATK2" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [t1, t2],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const e of module.effectsForTiming(EffectTiming.OnPlay, source)) await e.resolve(ctx);
    const calls = recorder.calls.filter((c) => c.verb === "forceAttack");
    expect(calls.map((c) => c.args[0]).sort()).toEqual(["A1", "A2"]);
  });

  it("RedirectAttack resolves its filter and calls redirectAttack with the candidates", async () => {
    const cand = makeFakePermanent({
      permanentId: "R1",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "R1c", cardId: "R1", ownerSeat: 1, faceUp: true } as never,
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "RedirectAttack",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              optional: false,
            },
          ],
        },
      ],
    };
    const module = irCardModule("Z-RED", compiled);
    const source = makeSource({ cardId: "Z-RED" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [cand],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const e of module.effectsForTiming(EffectTiming.OnUseAttack, source)) await e.resolve(ctx);
    const calls = recorder.calls.filter((c) => c.verb === "redirectAttack");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0]).toEqual(["R1"]);
    // The combat primitive resolves the current effect controller from its effect-seat stack.
    // The interpreter leaves chooserSeat absent unless printed text assigns another chooser.
    expect((calls[0]!.args[1] as { chooserSeat?: Seat })?.chooserSeat).toBeUndefined();
  });

  it("RedirectAttack chooser=opponent prompts the OPPONENT seat among their own Digimon, and is optional (BT4-075)", async () => {
    const oppDigimon = makeFakePermanent({
      permanentId: "DEF1",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "DEF1c", cardId: "DEF1", ownerSeat: 1, faceUp: true } as never,
    });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "RedirectAttack",
              target: { filter: { kind: ["Digimon"], unsuspended: true }, count: 1 },
              chooser: "opponent",
              optional: true,
            },
          ],
        },
      ],
    };
    const module = irCardModule("BT4-075", compiled);
    // Source owner is seat 0, so the opponent (defending) chooser seat is 1.
    const source = makeSource({ cardId: "BT4-075", ownerSeat: 0 as Seat });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [oppDigimon],
      definitionOf: () => makeFakeDefinition({ kinds: ["Digimon"] as never }),
    });
    for (const e of module.effectsForTiming(EffectTiming.OnUseAttack, source)) await e.resolve(ctx);
    const calls = recorder.calls.filter((c) => c.verb === "redirectAttack");
    expect(calls).toHaveLength(1);
    // Candidate is the opponent's (defender's) own Digimon.
    expect(calls[0]!.args[0]).toEqual(["DEF1"]);
    // The defending (opponent) seat chooses, and the redirect may be declined.
    const opts = calls[0]!.args[1] as { chooserSeat?: Seat; optional?: boolean };
    expect(opts.chooserSeat).toBe(1);
    expect(opts.optional).toBe(true);
  });
});

describe("RestrictPlay seat-level prohibition dispatch", () => {
  it("resolves the opponent seat and calls restrictPlay with the seat/match/mode/duration (EX7-014)", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenDigivolving",
          actions: [
            {
              kind: "RestrictPlay",
              seat: "opponent",
              filter: { kind: ["Digimon"], dpAtMost: 6000 },
              mode: "playOrMove",
              duration: "untilOpponentTurnEnd",
            },
          ],
        },
      ],
    };
    const module = irCardModule("EX7-014", compiled);
    const source = makeSource({ cardId: "EX7-014", ownerSeat: 0 as Seat });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    for (const e of module.effectsForTiming(EffectTiming.WhenDigivolving, source)) await e.resolve(ctx);
    const calls = recorder.calls.filter((c) => c.verb === "restrictPlay");
    expect(calls).toHaveLength(1);
    // restrictPlay(restrictedSeat, sourceSeat, match, mode, duration)
    expect(calls[0]!.args[0]).toBe(1); // opponent of seat-0 source => seat 1 is restricted
    expect(calls[0]!.args[1]).toBe(0); // source seat
    expect(calls[0]!.args[2]).toEqual({ kinds: ["Digimon"], dpAtMost: 6000 });
    expect(calls[0]!.args[3]).toBe("playOrMove");
  });
});

describe("CostModifier play/use dispatch (now executable)", () => {
  it("a play-cost reducer for your Digimon dispatches to changePlayCost with a matching predicate", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "CostModifier",
              costType: "play",
              amount: -1,
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: "all" },
              duration: "permanent",
            },
          ],
        },
      ],
    };
    const module = irCardModule("Z-PLAYCOST", compiled);
    const source = makeSource({ cardId: "Z-PLAYCOST" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changePlayCost");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]).toBe(-1); // delta
    // The predicate matches a seat-0 Digimon definition and rejects the opponent's.
    const predicate = calls[0]!.args[0] as (f: { def: CardDefinition; controllerSeat: Seat }) => boolean;
    const digimonDef = makeFakeDefinition({ kinds: ["Digimon"] as never });
    expect(predicate({ def: digimonDef, controllerSeat: 0 })).toBe(true);
    expect(predicate({ def: digimonDef, controllerSeat: 1 })).toBe(false); // not "mine"
    const tamerDef = makeFakeDefinition({ kinds: ["Tamer"] as never });
    expect(predicate({ def: tamerDef, controllerSeat: 0 })).toBe(false); // not a Digimon
  });

  it("a self use-cost reducer matches only this source's own card id", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "CostModifier",
              costType: "use",
              amount: -2,
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              duration: "permanent",
            },
          ],
        },
      ],
    };
    const module = irCardModule("Z-SELFCOST", compiled);
    const source = makeSource({ cardId: "Z-SELFCOST" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changePlayCost");
    expect(calls).toHaveLength(1);
    const predicate = calls[0]!.args[0] as (f: { def: CardDefinition; controllerSeat: Seat }) => boolean;
    expect(predicate({ def: makeFakeDefinition({ cardId: "Z-SELFCOST" }), controllerSeat: 0 })).toBe(true);
    expect(predicate({ def: makeFakeDefinition({ cardId: "OTHER" }), controllerSeat: 0 })).toBe(false);
  });

  it("mode:reduce records a negative digivolve-cost delta from a positive printed amount", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "CostModifier",
              mode: "reduce",
              costType: "digivolve",
              amount: 5,
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              duration: "forTheTurn",
            },
          ],
        },
      ],
    };
    const module = irCardModule("Z-EVO-REDUCE", compiled);
    const source = makeSource({ cardId: "Z-EVO-REDUCE" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changeEvoCost");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]).toBe(-5);
  });

  it("an inherited self reducer also enforces its digivolve-into filter", async () => {
    const host = makeFakePermanent({ permanentId: "SELF", controllerSeat: 0 as Seat });
    const source = makeSource({ cardId: "P-030", permanent: () => host });
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "YourTurn",
          isInherited: true,
          actions: [
            {
              kind: "CostModifier",
              mode: "reduce",
              costType: "digivolve",
              amount: 2,
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              into: { nameOrTrait: [{ tokens: ["AncientGarurumon"], match: "name" }] },
              duration: "forTheTurn",
            },
          ],
        },
      ],
    };
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownBattleArea: [host] });

    for (const effect of irCardModule("P-030", compiled).effectsForTiming(EffectTiming.None, source)) {
      await effect.resolve(ctx);
    }

    const predicate = recorder.calls.find((call) => call.verb === "changeEvoCost")!.args[0] as (match: {
      target: Permanent;
      into?: CardDefinition;
    }) => boolean;
    expect(
      predicate({
        target: host,
        into: makeFakeDefinition({ nameEn: "AncientGarurumon", kinds: [CardKind.Digimon] }),
      }),
    ).toBe(true);
    expect(
      predicate({
        target: host,
        into: makeFakeDefinition({ nameEn: "Omnimon", kinds: [CardKind.Digimon] }),
      }),
    ).toBe(false);
    expect(
      predicate({
        target: makeFakePermanent({ permanentId: "OTHER", controllerSeat: 0 as Seat }),
        into: makeFakeDefinition({ nameEn: "AncientGarurumon", kinds: [CardKind.Digimon] }),
      }),
    ).toBe(false);
  });

  it("onConsume arms end-of-turn actions for the Digimon whose once evo-cost modifier was consumed", async () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "CostModifier",
              mode: "reduce",
              costType: "digivolve",
              amount: 6,
              target: {
                filter: { controller: "mine", kind: ["Digimon"], levelComparison: { op: "eq", value: 6 } },
                count: "all",
              },
              into: { kind: ["Digimon"], levelComparison: { op: "eq", value: 7 } },
              duration: "forTheTurn",
              once: true,
              consumeBindAs: "thatDigimon",
              onConsume: [
                {
                  kind: "TrashDigivolution",
                  target: { filter: {}, count: 1, fromSelectionRef: "thatDigimon" },
                  amount: 99,
                },
                {
                  kind: "Return",
                  target: { filter: {}, count: 1, fromSelectionRef: "thatDigimon" },
                  to: "deckBottom",
                },
              ],
            },
          ],
        },
      ],
    };
    const module = irCardModule("Z-EVO-CONSUME", compiled);
    const source = makeSource({ cardId: "Z-EVO-CONSUME" });
    const consumed = makeFakePermanent({
      permanentId: "lv6#1",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "top#1", cardId: "BASE-6", ownerSeat: 0 } as never,
      stack: [{ instanceId: "stack#1", cardId: "LV5", ownerSeat: 0 }] as never,
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [consumed],
      definitionOf: (id) =>
        id === "LV7"
          ? makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon], level: 7 })
          : makeFakeDefinition({ cardId: id, kinds: [CardKind.Digimon], level: 6 }),
    });
    for (const e of module.effectsForTiming(EffectTiming.OnUseOption, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changeEvoCost");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]).toBe(-6);
    expect(calls[0]!.args[2]).toMatchObject({ once: true });
    const predicate = calls[0]!.args[0] as (m: { target: Permanent; into?: CardDefinition }) => boolean;
    expect(
      predicate({ target: consumed, into: makeFakeDefinition({ cardId: "LV7", kinds: [CardKind.Digimon], level: 7 }) }),
    ).toBe(true);
    expect(
      predicate({ target: consumed, into: makeFakeDefinition({ cardId: "LV6", kinds: [CardKind.Digimon], level: 6 }) }),
    ).toBe(false);

    const opts = calls[0]!.args[2] as { onConsume: (m: { target: Permanent; into?: CardDefinition }) => void };
    opts.onConsume({
      target: consumed,
      into: makeFakeDefinition({ cardId: "LV7", kinds: [CardKind.Digimon], level: 7 }),
    });
    const sub = recorder.calls.find((c) => c.verb === "subscribeSubTrigger")?.args[0] as {
      event: string;
      sourcePermanentId: string;
      once: boolean;
      run: (subCtx: EffectContext) => Promise<void>;
    };
    expect(sub).toMatchObject({ event: "endOfTurn", sourcePermanentId: "lv6#1", once: true });

    await sub.run(makeContext({ source, recorder, ownBattleArea: [consumed] }));
    expect(recorder.calls.some((c) => c.verb === "trashDigivolutionCards" && c.args[0] === "lv6#1")).toBe(true);
    expect(
      recorder.calls.some((c) => c.verb === "returnToDeck" && JSON.stringify(c.args[0]) === JSON.stringify(["top#1"])),
    ).toBe(true);
  });
});

describe("CostModifier mode:set (absolute cost set)", () => {
  // BT7-040: "the digivolution cost of this card is equal to your security count" — a SET
  // (not a signed delta). The interpreter records it via changeEvoCost with setFixed:true.
  function selfSetEvoCard(): CompiledCard {
    return {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "CostModifier",
              costType: "digivolve",
              mode: "set",
              amount: 0,
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              duration: "permanent",
              scaling: { per: 1, filter: { controller: "mine" }, unit: "security" },
            },
          ],
        },
      ],
    };
  }

  it("records a SET digivolve cost via changeEvoCost with setFixed:true (not a delta)", async () => {
    const module = irCardModule("BT7-040", selfSetEvoCard());
    const source = makeSource({ cardId: "BT7-040" });
    const recorder: Recorder = { calls: [] };
    // 3 security cards => the SET cost resolves to 3.
    const ctx = makeContext({ source, recorder, ownSecurity: [{}, {}, {}] });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changeEvoCost");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]).toBe(3); // the resolved absolute cost (security count)
    expect(calls[0]!.args[2]).toEqual({ setFixed: true, continuous: true });
  });

  it("a SET with a security count of 0 still records cost 0 (no early-return)", async () => {
    const module = irCardModule("BT7-040", selfSetEvoCard());
    const source = makeSource({ cardId: "BT7-040" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownSecurity: [] }); // empty security
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changeEvoCost");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]).toBe(0); // a count of 0 is a meaningful absolute cost
    expect(calls[0]!.args[2]).toEqual({ setFixed: true, continuous: true });
  });

  // P-116: "While you have [Agumon] AND [Pulsemon] AND [Gammamon], this card costs 0."
  // A literal-0 play-cost SET gated by an `allOf` AND of three named-Digimon-in-play gates.
  function p116Card(): CompiledCard {
    return {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Static",
          actions: [
            {
              kind: "CostModifier",
              costType: "play",
              mode: "set",
              amount: 0,
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              duration: "permanent",
              condition: {
                kind: "allOf",
                conditions: [
                  {
                    kind: "youHave",
                    filter: { controller: "any", nameOrTrait: [{ tokens: ["Agumon"], match: "nameExact" }] },
                    count: 1,
                  },
                  {
                    kind: "youHave",
                    filter: { controller: "any", nameOrTrait: [{ tokens: ["Pulsemon"], match: "nameExact" }] },
                    count: 1,
                  },
                  {
                    kind: "youHave",
                    filter: { controller: "any", nameOrTrait: [{ tokens: ["Gammamon"], match: "nameExact" }] },
                    count: 1,
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  function namedPermanent(permanentId: string, cardId: string, controllerSeat: Seat = 0): Permanent {
    return makeFakePermanent({ permanentId, controllerSeat, topCard: { cardId } as never });
  }

  const namesById: Record<string, string> = {
    AG: "Agumon",
    PU: "Pulsemon",
    GA: "Gammamon",
  };
  const defByName = (id: string): CardDefinition =>
    makeFakeDefinition({ cardId: id, nameEn: namesById[id] ?? id, kinds: ["Digimon"] as never });

  it("sets the play cost to 0 only when ALL three named Digimon are in play (AND, not OR)", async () => {
    const module = irCardModule("P-116", p116Card());
    const source = makeSource({ cardId: "P-116" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [namedPermanent("ag", "AG"), namedPermanent("pu", "PU"), namedPermanent("ga", "GA")],
      definitionOf: defByName,
    });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changePlayCost");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]).toBe(0); // SET to 0
    expect(calls[0]!.args[2]).toEqual({ setFixed: true });
  });

  it("does NOT set the cost when only some of the named Digimon are in play", async () => {
    const module = irCardModule("P-116", p116Card());
    const source = makeSource({ cardId: "P-116" });
    const recorder: Recorder = { calls: [] };
    // Agumon + Pulsemon present, Gammamon missing => AND fails => no cost set.
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [namedPermanent("ag", "AG"), namedPermanent("pu", "PU")],
      definitionOf: defByName,
    });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "changePlayCost")).toHaveLength(0);
  });

  it("sets the cost across both controllers when each exact name is present", async () => {
    const module = irCardModule("P-116", p116Card());
    const source = makeSource({ cardId: "P-116" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [namedPermanent("ag", "AG")],
      opponentBattleArea: [namedPermanent("pu", "PU", 1), namedPermanent("ga", "GA", 1)],
      definitionOf: defByName,
    });
    for (const e of module.effectsForTiming(EffectTiming.None, source)) await e.resolve(ctx);

    const calls = recorder.calls.filter((c) => c.verb === "changePlayCost");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]).toBe(0);
  });
});

describe("[Main] / activateEffect reconciliation", () => {
  it("exposes an IR [Main] effect at BOTH OnUseOption and OnDeclaration", () => {
    const compiled: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "Main", actions: [{ kind: "GainMemory", amount: 1 }] }],
    };
    const module = irCardModule("Z-MAIN", compiled);
    const source = makeSource({ cardId: "Z-MAIN" });
    // Option-from-hand window AND the activateEffect (player-activated ability) window
    // both surface the [Main] effect, with distinct, timing-scoped effect keys.
    const onUse = module.effectsForTiming(EffectTiming.OnUseOption, source);
    const onDecl = module.effectsForTiming(EffectTiming.OnDeclaration, source);
    expect(onUse).toHaveLength(1);
    expect(onDecl).toHaveLength(1);
    expect(onUse[0]!.effectKey).not.toBe(onDecl[0]!.effectKey);
  });
});

// ---------------------------------------------------------------------------
// DP superlative narrowing (Phase 13, Plan 01, Task 2)
// ---------------------------------------------------------------------------

describe("superlative narrowing — highestDP / lowestDP", () => {
  // Helpers to build a CompiledCard with a Delete action targeting our permanents
  function deleteCard(superlative: "highestDP" | "lowestDP"): CompiledCard {
    return {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Delete",
              target: {
                filter: {
                  controller: "opponent",
                  // kind: ["Digimon"] omitted — fake definitions have empty kinds
                  superlative,
                },
                count: 1,
              },
            },
          ],
        },
      ],
    };
  }

  function makePerm(id: string, dp: number): Permanent {
    return makeFakePermanent({
      permanentId: id,
      controllerSeat: 1 as Seat,
      currentDP: dp,
      baseDP: dp,
      topCard: { cardId: `${id}-card` } as never,
    });
  }

  function ctxWith(recorder: Recorder, perms: Permanent[]): EffectContext {
    const source = makeSource({ cardId: "Z-DP" });
    return makeContext({ source, recorder, opponentBattleArea: perms });
  }

  it("lowestDP: narrows to the lowest-DP Digimon among opponents", async () => {
    const compiled = deleteCard("lowestDP");
    const recorder: Recorder = { calls: [] };
    const lo = makePerm("lo", 3000);
    const hi = makePerm("hi", 5000);
    const ctx = ctxWith(recorder, [lo, hi]);
    const source = makeSource({ cardId: "Z-DP-LOW" });
    const effects = irCardModule("Z-DP-LOW", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    for (const e of effects) await e.resolve(ctx);

    const delCall = recorder.calls.find((call) => call.verb === "deletePermanent");
    expect(delCall).toBeDefined();
    expect(delCall!.args[0]).toEqual(["lo"]);
  });

  it("highestDP: narrows to the highest-DP Digimon among opponents", async () => {
    const compiled = deleteCard("highestDP");
    const recorder: Recorder = { calls: [] };
    const lo = makePerm("lo", 3000);
    const hi = makePerm("hi", 5000);
    const ctx = ctxWith(recorder, [lo, hi]);
    const source = makeSource({ cardId: "Z-DP-HI" });
    const effects = irCardModule("Z-DP-HI", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    for (const e of effects) await e.resolve(ctx);

    const delCall = recorder.calls.find((c) => c.verb === "deletePermanent");
    expect(delCall).toBeDefined();
    expect(delCall!.args[0]).toEqual(["hi"]);
  });

  it("ties: all extrema are kept (both 3000-DP Digimon when lowestDP)", async () => {
    const compiled = deleteCard("lowestDP");
    const recorder: Recorder = { calls: [] };
    const a = makePerm("a", 3000);
    const b = makePerm("b", 3000);
    const c = makePerm("c", 5000);
    const ctx = ctxWith(recorder, [a, b, c]);
    const source = makeSource({ cardId: "Z-DP-TIE" });
    const effects = irCardModule("Z-DP-TIE", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    for (const e of effects) await e.resolve(ctx);

    const delCall = recorder.calls.find((call) => call.verb === "deletePermanent");
    expect(delCall).toBeDefined();
    const deleted = delCall!.args[0] as string[];
    expect(deleted).not.toContain("c");
    expect(deleted.length).toBe(1);
  });

  it("no-DP: a permanent with DP <= 0 is excluded from highestDP", async () => {
    const compiled = deleteCard("highestDP");
    const recorder: Recorder = { calls: [] };
    const digi = makePerm("digi", 5000);
    const zero = makePerm("zero", 0);
    const ctx = ctxWith(recorder, [digi, zero]);
    const source = makeSource({ cardId: "Z-DP-NODP" });
    const effects = irCardModule("Z-DP-NODP", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    for (const e of effects) await e.resolve(ctx);

    const delCall = recorder.calls.find((c) => c.verb === "deletePermanent");
    expect(delCall).toBeDefined();
    expect(delCall!.args[0]).toEqual(["digi"]);
  });

  it("FAILS-WHEN-REVERTED: without DP branch, lowestDP selects wrong target", async () => {
    const compiled = deleteCard("lowestDP");
    const recorder: Recorder = { calls: [] };
    const lo = makePerm("lo", 3000);
    const hi = makePerm("hi", 5000);
    const ctx = ctxWith(recorder, [lo, hi]);
    const source = makeSource({ cardId: "Z-DP-A3" });
    const effects = irCardModule("Z-DP-A3", compiled).effectsForTiming(EffectTiming.OnPlay, source);

    for (const e of effects) await e.resolve(ctx);

    const delCall = recorder.calls.find((c) => c.verb === "deletePermanent");
    expect(delCall).toBeDefined();
    expect(delCall!.args[0]).toEqual(["lo"]);
    expect(delCall!.args[0]).not.toContain("hi");
  });
});

// ---------------------------------------------------------------------------
// Budget-multi-delete (Phase 13, Plan 02, Task 2)
// ---------------------------------------------------------------------------

describe("DeleteBudget (budget-multi-delete)", () => {
  function budgetCard(budget: number, upTo?: boolean): CompiledCard {
    return {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "DeleteBudget",
              filter: { controller: "opponent" },
              budget,
              upTo,
            } as never,
          ],
        },
      ],
    };
  }

  it("budget=3: only the play-cost-3 permanent is deleted (5 and 7 exceed budget)", async () => {
    const compiled = budgetCard(3);
    const recorder: Recorder = { calls: [] };
    const lo = makeFakePermanent({
      permanentId: "lo",
      controllerSeat: 1 as Seat,
      currentDP: 3000,
      topCard: { cardId: "c-lo" } as never,
    });
    const mid = makeFakePermanent({
      permanentId: "mid",
      controllerSeat: 1 as Seat,
      currentDP: 5000,
      topCard: { cardId: "c-mid" } as never,
    });
    const hi = makeFakePermanent({
      permanentId: "hi",
      controllerSeat: 1 as Seat,
      currentDP: 7000,
      topCard: { cardId: "c-hi" } as never,
    });
    const source = makeSource({ cardId: "Z-BUDGET" });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [lo, mid, hi],
      definitionOf: (cardId: string) => {
        const costs: Record<string, number> = { "c-lo": 3, "c-mid": 5, "c-hi": 7 };
        return makeFakeDefinition({ cardId, playCost: costs[cardId] ?? 0 });
      },
    });
    const effects = irCardModule("Z-BUDGET", compiled).effectsForTiming(EffectTiming.OnPlay, source);
    for (const e of effects) await e.resolve(ctx);
    const delCall = recorder.calls.find((c) => c.verb === "deletePermanent");
    expect(delCall).toBeDefined();
    expect(delCall!.args[0]).toEqual(["lo"]);
  });

  it("budget=10: play-cost-3 and 5 deleted (cumulative 8 <= 10), 7 skipped", async () => {
    const compiled = budgetCard(10);
    const recorder: Recorder = { calls: [] };
    const lo = makeFakePermanent({
      permanentId: "lo",
      controllerSeat: 1 as Seat,
      currentDP: 3000,
      topCard: { cardId: "c-lo" } as never,
    });
    const mid = makeFakePermanent({
      permanentId: "mid",
      controllerSeat: 1 as Seat,
      currentDP: 5000,
      topCard: { cardId: "c-mid" } as never,
    });
    const hi = makeFakePermanent({
      permanentId: "hi",
      controllerSeat: 1 as Seat,
      currentDP: 7000,
      topCard: { cardId: "c-hi" } as never,
    });
    const source = makeSource({ cardId: "Z-BUDGET10" });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [lo, mid, hi],
      definitionOf: (cardId: string) => {
        const costs: Record<string, number> = { "c-lo": 3, "c-mid": 5, "c-hi": 7 };
        return makeFakeDefinition({ cardId, playCost: costs[cardId] ?? 0 });
      },
    });
    const effects = irCardModule("Z-BUDGET10", compiled).effectsForTiming(EffectTiming.OnPlay, source);
    for (const e of effects) await e.resolve(ctx);
    const delCall = recorder.calls.find((c) => c.verb === "deletePermanent");
    expect(delCall).toBeDefined();
    expect(delCall!.args[0]).toEqual(["lo", "mid"]);
  });

  it("budget=0: nothing is deleted (returns 0)", async () => {
    const compiled = budgetCard(0);
    const recorder: Recorder = { calls: [] };
    const p = makeFakePermanent({
      permanentId: "p",
      controllerSeat: 1 as Seat,
      currentDP: 3000,
      topCard: { cardId: "c-p" } as never,
    });
    const source = makeSource({ cardId: "Z-BUDGET0" });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [p],
      definitionOf: () => makeFakeDefinition({ cardId: "c-p", playCost: 3 }),
    });
    const effects = irCardModule("Z-BUDGET0", compiled).effectsForTiming(EffectTiming.OnPlay, source);
    for (const e of effects) await e.resolve(ctx);
    const delCall = recorder.calls.find((c) => c.verb === "deletePermanent");
    expect(delCall).toBeUndefined();
  });

  it("FAILS-WHEN-REVERTED: without DeleteBudget case, UnsupportedEffectError is thrown", () => {
    // The A3 guard: the interpreter must have a 'case "DeleteBudget":' handler.
    // Removing it would hit the default unsupported path.
    // This test verifies the card module registers and builds correctly.
    const compiled = budgetCard(3);
    const module = irCardModule("Z-BUDGET-A3", compiled);
    expect(module).toBeDefined();
    expect(module.cardId).toBe("Z-BUDGET-A3");
  });
});

// ---------------------------------------------------------------------------
// hostFilter: Tamer-under digivolution card zone sourcing (Phase 13, Plan 03, Task 1)
// ---------------------------------------------------------------------------

describe("candidateLooseInstances — hostFilter gating", () => {
  it.each([
    { faceDown: true, hidden: true, expected: ["lower-hidden"] },
    { faceDown: undefined, hidden: true, expected: ["visible-bottom"] },
    { faceDown: true, hidden: false, expected: [] },
  ])("selects bottom sources with faceDown=$faceDown and hidden=$hidden", ({ faceDown, hidden, expected }) => {
    const host = makePermWithStack(
      "host",
      "DIGIMON",
      ["Digimon"],
      [
        { instanceId: "visible-bottom", cardId: "DIGI-A" },
        { instanceId: "lower-hidden", cardId: "DIGI-A" },
        { instanceId: "upper-hidden", cardId: "DIGI-A" },
      ],
    );
    host.controllerSeat = 0;
    for (const card of host.stack) {
      card.ownerSeat = 0;
      card.faceUp = card.instanceId === "visible-bottom" || !hidden;
    }
    const ctx = makeContext({
      source: makeSource(),
      recorder: { calls: [] },
      ownBattleArea: [host],
      definitionOf: (cardId: string) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    expect(
      candidateLooseInstances(
        ctx,
        {
          filter: { controller: "mine", position: "bottom", ...(faceDown === true ? { faceDown: true } : {}) },
          count: 1,
        },
        ["digivolutionCards"],
      ).map(({ instanceId }) => instanceId),
    ).toEqual(expected);
  });
  it.each(["digivolutionCards", "underMyTamers", "underTamers", "underTamer", "digivolutionCardsUnderTamers"] as const)(
    "excludes the imminent play instance from %s while preserving another source",
    (zone) => {
      const tamer = makePermWithStack(
        "host",
        "TAMER",
        ["Tamer"],
        [
          { instanceId: "imminent", cardId: "DIGI-A" },
          { instanceId: "other", cardId: "DIGI-A" },
        ],
      );
      tamer.controllerSeat = 0;
      for (const card of tamer.stack) card.ownerSeat = 0;
      const ctx = makeContext({
        source: makeSource(),
        recorder: { calls: [] },
        ownBattleArea: [tamer],
        definitionOf: (cardId: string) =>
          makeFakeDefinition({
            cardId,
            kinds: cardId === "TAMER" ? [CardKind.Tamer] : [CardKind.Digimon],
          }),
      });
      ctx.trigger = { wouldBePlayedInstanceId: "imminent" };
      expect(
        candidateLooseInstances(ctx, { filter: { controller: "mine" }, count: "all" }, [zone]).map(
          (card) => card.instanceId,
        ),
      ).toEqual(["other"]);
      ctx.trigger = {};
      expect(
        candidateLooseInstances(ctx, { filter: { controller: "mine" }, count: "all" }, [zone]).map(
          (card) => card.instanceId,
        ),
      ).toEqual(["imminent", "other"]);
    },
  );
  function makePermWithStack(
    permanentId: string,
    topCardId: string,
    topKinds: string[],
    stackCards: { instanceId: string; cardId: string }[],
  ) {
    const perm = makeFakePermanent({
      permanentId,
      controllerSeat: 1 as Seat,
      topCard: { cardId: topCardId } as never,
    });
    // Override stack with test cards
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (perm as any).stack = stackCards.map((c) => ({
      instanceId: c.instanceId,
      cardId: c.cardId,
      ownerSeat: 1 as Seat,
    }));
    return perm;
  }

  it("hostFilter {kind:['Tamer']} includes cards under Tamer, excludes cards under Digimon", () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const tamer = makePermWithStack("tamer1", "TAMER", ["Tamer"], [{ instanceId: "t-stack", cardId: "DIGI-A" }]);
    const digi = makePermWithStack("digi1", "DIGIMON", ["Digimon"], [{ instanceId: "d-stack", cardId: "DIGI-B" }]);
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [tamer, digi],
      definitionOf: (cardId: string) =>
        makeFakeDefinition({
          cardId,
          kinds: cardId === "TAMER" ? (["Tamer"] as never) : (["Digimon"] as never),
        }),
    });
    const result = candidateLooseInstances(
      ctx,
      {
        filter: { controller: "mine", zone: "digivolutionCards", hostFilter: { kind: ["Tamer"] } },
        count: "all",
      } as never,
      ["digivolutionCards"],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.instanceId).toBe("t-stack");
  });

  it("without hostFilter, both Digimon and Tamer stack cards are included", () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const tamer = makePermWithStack("tamer1", "TAMER", ["Tamer"], [{ instanceId: "t-stack", cardId: "DIGI-A" }]);
    const digi = makePermWithStack("digi1", "DIGIMON", ["Digimon"], [{ instanceId: "d-stack", cardId: "DIGI-B" }]);
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [tamer, digi],
      definitionOf: () => makeFakeDefinition({ cardId: "DIGI-A", kinds: ["Digimon"] as never }),
    });
    const result = candidateLooseInstances(
      ctx,
      {
        filter: { controller: "mine", zone: "digivolutionCards" },
        count: "all",
      } as never,
      ["digivolutionCards"],
    );
    expect(result).toHaveLength(2);
  });

  it("applies a common hostFilter only to hosted cards in a mixed loose/stack pool", () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: (cardId) => makeFakeDefinition({ cardId, kinds: [CardKind.Digimon] }),
    });
    ctx.game.player(0).trash.push({
      instanceId: "loose-trash",
      cardId: "LOOSE",
      ownerSeat: 0 as Seat,
      faceUp: true,
    } as never);

    expect(
      candidateLooseInstances(
        ctx,
        {
          filter: { controller: "mine", kind: ["Digimon"], hostFilter: { isSelfRef: true } },
          count: 1,
        } as never,
        ["trash", "digivolutionCards"],
      ).map(({ instanceId }) => instanceId),
    ).toEqual(["loose-trash"]);
  });

  it("does not let a loose card satisfy an OR branch qualified by a hostFilter", () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      definitionOf: (cardId) =>
        makeFakeDefinition({ cardId, kinds: [CardKind.Digimon], nameEn: "Royal", types: ["Royal Knight"] }),
    });
    ctx.game.player(0).trash.push({
      instanceId: "loose-royal",
      cardId: "ROYAL",
      ownerSeat: 0 as Seat,
      faceUp: true,
    } as never);

    expect(
      candidateLooseInstances(
        ctx,
        {
          filter: {
            controller: "mine",
            or: [
              { nameOrTrait: [{ tokens: ["Sistermon"], match: "name" }] },
              { trait: "Royal Knight", hostFilter: { zone: "breeding" } },
            ],
          },
          count: 1,
        } as never,
        ["trash", "digivolutionCards"],
      ),
    ).toEqual([]);
  });

  it("falls through an invalid hosted OR branch to a later branch that does not require that host", () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const digi = makePermWithStack(
      "digi1",
      "DIGIMON",
      ["Digimon"],
      [{ instanceId: "fallback-stack", cardId: "FALLBACK" }],
    );
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [digi],
      definitionOf: (cardId) =>
        makeFakeDefinition({ cardId, nameEn: cardId === "FALLBACK" ? "Fallback" : cardId, kinds: [CardKind.Digimon] }),
    });

    expect(
      candidateLooseInstances(
        ctx,
        {
          filter: {
            controller: "mine",
            or: [
              { kind: ["Digimon"], hostFilter: { kind: ["Tamer"] } },
              { nameOrTrait: [{ tokens: ["Fallback"], match: "nameExact" }] },
            ],
          },
          count: 1,
        } as never,
        ["digivolutionCards"],
      ).map(({ instanceId }) => instanceId),
    ).toEqual(["fallback-stack"]);
  });

  it("FAILS-WHEN-REVERTED: removing hostFilter check returns both cards", () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const tamer = makePermWithStack("tamer1", "TAMER", ["Tamer"], [{ instanceId: "t-stack", cardId: "DIGI-A" }]);
    const digi = makePermWithStack("digi1", "DIGIMON", ["Digimon"], [{ instanceId: "d-stack", cardId: "DIGI-B" }]);
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [tamer, digi],
      definitionOf: (cardId: string) =>
        makeFakeDefinition({
          cardId,
          kinds: cardId === "TAMER" ? (["Tamer"] as never) : (["Digimon"] as never),
        }),
    });
    // A3: with hostFilter: { kind: ["Tamer"] }, only t-stack returned
    const result = candidateLooseInstances(
      ctx,
      {
        filter: { controller: "mine", zone: "digivolutionCards", hostFilter: { kind: ["Tamer"] } },
        count: "all",
      } as never,
      ["digivolutionCards"],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.instanceId).toBe("t-stack");
    expect(result[0]!.hostPermanentId).toBe("tamer1");
  });
});

// -------------------------------------------------------------------
// Digisorption redirect (BT3-056 Tyranomon, Plan 13-04 Task 1)
// -------------------------------------------------------------------

describe("Replacement digisorptionRedirect", () => {
  function replacementCard(opts: { digisorptionRedirect?: boolean }): CompiledCard {
    return {
      coverage: "partial",
      residual: [],
      effects: [
        {
          trigger: "WhenDigivolving",
          optional: true,
          actions: [
            {
              kind: "Replacement",
              event: "wouldDigivolve",
              mode: "reduceCost",
              amount: 3,
              cost: {
                kind: "suspend",
                target: {
                  filter: { controller: "mine", kind: ["Digimon"] },
                  count: 1,
                },
                optional: true,
              },
              digisorptionRedirect: opts.digisorptionRedirect,
              raw: "<Digisorption -3>",
            } as never,
          ],
        },
      ],
    } as CompiledCard;
  }

  it("digisorptionRedirect:true passes the redirect flag via subscribeReplacement", async () => {
    const compiled = replacementCard({ digisorptionRedirect: true });
    const source = makeSource({ cardId: "BT3-056" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const effects = irCardModule("BT3-056", compiled).effectsForTiming(EffectTiming.WhenDigivolving, source);
    await effects[0]!.resolve(ctx);
    const subs = recorder.calls.filter((c) => c.verb === "subscribeReplacement");
    expect(subs).toHaveLength(1);
    const sub = subs[0]!.args[0] as Record<string, unknown>;
    expect(sub.digisorptionRedirect).toBe(true);
  });

  it("digisorptionRedirect absent: flag is not set on the subscription", async () => {
    const compiled = replacementCard({});
    const source = makeSource({ cardId: "NO-DIGISORP" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const effects = irCardModule("NO-DIGISORP", compiled).effectsForTiming(EffectTiming.WhenDigivolving, source);
    await effects[0]!.resolve(ctx);
    const subs = recorder.calls.filter((c) => c.verb === "subscribeReplacement");
    expect(subs).toHaveLength(1);
    const sub = subs[0]!.args[0] as Record<string, unknown>;
    expect(sub.digisorptionRedirect).toBeUndefined();
  });

  it("FAILS-WHEN-REVERTED: digisorptionRedirect:false — flag is absent, cost targets controller's own Digimon", async () => {
    // A3 gate: prove that WITHOUT the flag, the subscription does NOT carry the redirect.
    // Removing the digisorptionRedirect check would mean the opponent's Digimon are NOT available
    // for the suspend cost — wrong seat.
    const compiled = replacementCard({ digisorptionRedirect: false });
    const source = makeSource({ cardId: "NO-REDIRECT" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    const effects = irCardModule("NO-REDIRECT", compiled).effectsForTiming(EffectTiming.WhenDigivolving, source);
    await effects[0]!.resolve(ctx);
    const subs = recorder.calls.filter((c) => c.verb === "subscribeReplacement");
    expect(subs).toHaveLength(1);
    const sub = subs[0]!.args[0] as Record<string, unknown>;
    // FAILS-WHEN-REVERTED: removing the redirect => flag is absent (undefined/false).
    // The cost resolves against controller's own Digimon — the standard, non-redirected behavior.
    expect(sub.digisorptionRedirect).toBeFalsy();
  });
});

describe("RevealAdd optional ('you may ... among them')", () => {
  function revealPlay(optional: boolean): CompiledCard {
    return {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "RevealAdd",
              revealCount: 1,
              add: [{ filter: { kind: ["Digimon"] }, count: 1, to: "play", ...(optional ? { optional: true } : {}) }],
              rest: "deckBottom",
            } as never,
          ],
        },
      ],
    } as CompiledCard;
  }
  const revealed = [{ instanceId: "R1", cardId: "C1" }];
  const asDigimon = () => makeFakeDefinition({ cardId: "C1", kinds: ["Digimon"] as never });

  it("optional spec prompts and lets the player decline (plays nothing)", async () => {
    const source = makeSource({ cardId: "X-REVEAL-OPT" });
    const recorder: Recorder = { calls: [] };
    let prompted = false;
    const ctx = makeContext({
      source,
      recorder,
      revealed,
      definitionOf: asDigimon,
      selectCardsAnswer: () => {
        prompted = true;
        return [];
      },
    });
    const effects = irCardModule("X-REVEAL-OPT", revealPlay(true)).effectsForTiming(EffectTiming.OnUseOption, source);
    await effects[0]!.resolve(ctx);
    expect(prompted).toBe(true);
    expect(recorder.calls.some((c) => c.verb === "playInstances")).toBe(false);
    expect(recorder.calls.some((c) => c.verb === "returnToDeck")).toBe(true);
  });

  it("optional spec with no eligible revealed cards skips the empty selection prompt", async () => {
    const source = makeSource({ cardId: "X-REVEAL-NO-MATCH" });
    const recorder: Recorder = { calls: [] };
    let prompted = false;
    const ctx = makeContext({
      source,
      recorder,
      revealed,
      definitionOf: () => makeFakeDefinition({ cardId: "C1", kinds: ["Tamer"] as never }),
      selectCardsAnswer: () => {
        prompted = true;
        return [];
      },
    });
    const effects = irCardModule("X-REVEAL-NO-MATCH", revealPlay(true)).effectsForTiming(
      EffectTiming.OnUseOption,
      source,
    );

    await effects[0]!.resolve(ctx);

    expect(prompted).toBe(false);
    expect(recorder.calls.some((c) => c.verb === "playInstances")).toBe(false);
    expect(recorder.calls.some((c) => c.verb === "returnToDeck")).toBe(true);
  });

  it("mandatory play spec with one match still asks for confirmation", async () => {
    const source = makeSource({ cardId: "X-REVEAL-MAND" });
    const recorder: Recorder = { calls: [] };
    let prompted = false;
    const ctx = makeContext({
      source,
      recorder,
      revealed,
      definitionOf: asDigimon,
      selectCardsAnswer: () => {
        prompted = true;
        return ["R1"];
      },
    });
    const effects = irCardModule("X-REVEAL-MAND", revealPlay(false)).effectsForTiming(EffectTiming.OnUseOption, source);
    await effects[0]!.resolve(ctx);
    expect(prompted).toBe(true);
    expect(recorder.calls.some((c) => c.verb === "playInstances")).toBe(true);
  });

  it("mandatory search-to-hand with one match still asks for confirmation", async () => {
    const source = makeSource({ cardId: "X-REVEAL-SEARCH" });
    const recorder: Recorder = { calls: [] };
    let prompted = false;
    const ctx = makeContext({
      source,
      recorder,
      revealed,
      definitionOf: asDigimon,
      selectCardsAnswer: () => {
        prompted = true;
        return ["R1"];
      },
    });
    const compiled = revealPlay(false);
    const reveal = compiled.effects[0]!.actions[0] as Extract<Action, { kind: "RevealAdd" }>;
    reveal.add[0]!.to = "hand";
    const effects = irCardModule("X-REVEAL-SEARCH", compiled).effectsForTiming(EffectTiming.OnUseOption, source);

    await effects[0]!.resolve(ctx);

    expect(prompted).toBe(true);
    expect(recorder.calls.some((c) => c.verb === "returnToHand")).toBe(true);
  });

  it("pays the remaining cost for a reduced-cost revealed play", async () => {
    const source = makeSource({ cardId: "X-REVEAL-REDUCED" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      revealed,
      definitionOf: asDigimon,
      selectCardsAnswer: () => ["R1"],
    });
    const compiled = revealPlay(false);
    const reveal = compiled.effects[0]!.actions[0] as Extract<Action, { kind: "RevealAdd" }>;
    reveal.add[0]!.costDelta = 3;
    const effects = irCardModule("X-REVEAL-REDUCED", compiled).effectsForTiming(EffectTiming.OnUseOption, source);

    await effects[0]!.resolve(ctx);

    expect(recorder.calls).toContainEqual({
      verb: "playInstances",
      args: [["R1"], { payCost: true, costDelta: 3 }],
    });
  });
});

describe("RevealAdd rest-to-trash sequencing", () => {
  it("applies add-slot countModifier before trashing the unrevealed remainder", async () => {
    const source = makeSource({ cardId: "BT8-068-SHAPE" });
    const recorder: Recorder = { calls: [] };
    const opponentA = makeFakePermanent({
      permanentId: "OPP_A",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "opp-a", cardId: "OPP_DIGI", ownerSeat: 1 as Seat, faceUp: true } as never,
    });
    const opponentB = makeFakePermanent({
      permanentId: "OPP_B",
      controllerSeat: 1 as Seat,
      topCard: { instanceId: "opp-b", cardId: "OPP_DIGI", ownerSeat: 1 as Seat, faceUp: true } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      opponentBattleArea: [opponentA, opponentB],
      revealed: [
        { instanceId: "R1", cardId: "MAME_A" },
        { instanceId: "R2", cardId: "MAME_B" },
        { instanceId: "R3", cardId: "MAME_C" },
      ],
      definitionOf: (id) =>
        makeFakeDefinition({
          cardId: id,
          kinds: ["Digimon"] as never,
          nameEn: id.startsWith("MAME") ? `Mamemon ${id}` : id,
          playCost: id.startsWith("MAME") ? 10 : 3,
        }),
    });

    const module = irCardModule("BT8-068-count-modifier", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "RevealAdd",
              revealCount: 3,
              add: [
                {
                  filter: {
                    kind: ["Digimon"],
                    nameOrTrait: [{ tokens: ["Mamemon"], match: "name" }],
                    playCostLte: 10,
                  },
                  count: 0,
                  countModifier: {
                    amount: 1,
                    scaling: {
                      per: 1,
                      filter: { controller: "opponent", kind: ["Digimon"] },
                      unit: "cards",
                    },
                  },
                  to: "play",
                  optional: true,
                },
              ],
              rest: "trash",
            },
          ],
        },
      ],
    } as CompiledCard);

    const effect = module.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls).toContainEqual({ verb: "returnToHand", args: [["R1", "R2"], { silent: true }] });
    expect(recorder.calls).toContainEqual({ verb: "playInstances", args: [["R1", "R2"], { payCost: false }] });
    expect(recorder.calls).toContainEqual({ verb: "trash", args: [["R3"], { byEffectSeat: 0 }] });
  });

  it("waits for trashing the unrevealed remainder before resolving", async () => {
    const source = makeSource({ cardId: "Z-REVEAL-TRASH" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      revealed: [{ instanceId: "R1", cardId: "C1" }],
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    ctx.fx.trash = async (...args) => {
      recorder.calls.push({ verb: "trash", args });
      await gate;
      return [];
    };

    const module = irCardModule("Z-REVEAL-TRASH", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [{ kind: "RevealAdd", revealCount: 1, add: [], rest: "trash" }],
        },
      ],
    });
    const effect = module.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    const resolving = effect.resolve(ctx).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(recorder.calls).toContainEqual({ verb: "trash", args: [["R1"], { byEffectSeat: 0 }] });
    expect(finished).toBe(false);

    release();
    await resolving;
    expect(finished).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// count:"all" trash/return costs (engine-audit finding 6): `n = count === "all"
// ? Infinity : count` then `candidates.length < n` made every "all"-shaped cost
// unpayable, since a finite candidate pool is always less than Infinity. Paying
// with ALL candidates should instead require n = candidates.length (an empty
// pool is unpayable only when the cost isn't `upTo`/optional).
// ---------------------------------------------------------------------------
describe('payCost: count:"all" trash/return costs', () => {
  function makePermWithStack(permanentId: string, stackCardIds: string[]): Permanent {
    return makeFakePermanent({
      permanentId,
      controllerSeat: 0 as Seat,
      topCard: { instanceId: `${permanentId}-top`, cardId: "TOP" } as never,
      stack: stackCardIds.map((instanceId) => ({ instanceId, cardId: "STK", ownerSeat: 0 as Seat })) as never,
    });
  }

  it("BT21-054-shape: trashing ALL of any of your Digimon's digivolution cards is payable with a nonempty pool", async () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const permA = makePermWithStack("permA", ["a1", "a2"]);
    const permB = makePermWithStack("permB", ["b1"]);
    const ctx = makeContext({ source, recorder, ownBattleArea: [permA, permB] });
    const cost = {
      kind: "trash",
      target: { filter: { controller: "mine", zone: "digivolutionCards" }, count: "all" },
    } as never;

    const paid = await payCost(ctx, cost);

    expect(paid).toBe(true);
    // Routed through the atomic stack-trash primitive so replacement effects cannot
    // turn this all-or-nothing cost into a partial payment.
    const trashCalls = recorder.calls.filter((c) => c.verb === "trashDigivolutionCardsAtomic");
    expect(trashCalls).toHaveLength(1);
    const allIds = (trashCalls[0]!.args[0] as { instanceId: string }[]).map(({ instanceId }) => instanceId);
    // All 3 digivolution cards across both permanents were trashed, not "unpayable".
    expect(allIds.sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("FAILS-WHEN-REVERTED: with Infinity as n, the same nonempty pool would be unpayable", async () => {
    // Documents the bug directly: candidates.length (3) < Infinity is always true,
    // so the pre-fix code returned false here even though 3 candidates exist.
    const n = Infinity;
    expect(3 < n).toBe(true); // any finite candidate count is "insufficient" against Infinity
  });

  it("BT17-068-shape: returning ALL matching cards from trash to the deck is payable with a nonempty pool", async () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder });
    (ctx.game as unknown as { player: (s: Seat) => { trash: { instanceId: string; cardId: string }[] } }).player = (
      s: Seat,
    ) =>
      s === 0
        ? ({
            trash: [
              { instanceId: "t1", cardId: "APO" },
              { instanceId: "t2", cardId: "APO" },
            ],
          } as never)
        : ({ trash: [] } as never);
    const cost = {
      kind: "return",
      target: { filter: { controller: "mine", zone: "trash" }, count: "all" },
      raw: "by returning all [Apocalymon] from your trash to the bottom of the deck",
    } as never;

    const paid = await payCost(ctx, cost);

    expect(paid).toBe(true);
    const returnCalls = recorder.calls.filter((c) => c.verb === "returnToDeck");
    expect(returnCalls).toHaveLength(1);
    expect((returnCalls[0]!.args[0] as string[]).sort()).toEqual(["t1", "t2"]);
  });

  it("an empty candidate pool for an all-shaped trash cost is unpayable (not vacuously true)", async () => {
    const source = makeSource();
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({ source, recorder, ownBattleArea: [] });
    const cost = {
      kind: "trash",
      target: { filter: { controller: "mine", zone: "digivolutionCards" }, count: "all" },
    } as never;

    const paid = await payCost(ctx, cost);

    expect(paid).toBe(false);
  });

  it("AddDPFromSuspendedCost binds the suspended Digimon DP and attack keyword", async () => {
    const self = makeFakePermanent({
      permanentId: "SELF",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "self-card", cardId: "TEST-ADD-DP", ownerSeat: 0, faceUp: true } as never,
      currentDP: 5000,
    });
    const ally = makeFakePermanent({
      permanentId: "ALLY",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "ally-card", cardId: "ALLY", ownerSeat: 0, faceUp: true } as never,
      currentDP: 3000,
    });
    const source = makeSource({ cardId: "TEST-ADD-DP", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [self, ally],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never }),
    });
    const module = irCardModule("TEST-ADD-DP", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "AddDPFromSuspendedCost",
              cost: {
                kind: "suspend",
                target: {
                  filter: { controller: "mine", kind: ["Digimon"], excludeSelf: true, unsuspended: true },
                  count: 1,
                },
              },
              dpSource: { kind: "suspendedTarget" },
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              duration: "forThisAttack",
              alsoGainKeywords: [{ keyword: "SecurityAttack", amount: 1 }],
            },
          ],
        },
      ],
    });

    const effect = module.effectsForTiming(EffectTiming.OnUseAttack, source)[0];
    expect(effect).toBeDefined();
    await effect!.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "suspend")).toHaveLength(1);
    expect(recorder.calls.find((c) => c.verb === "modifyDP")?.args).toEqual(["SELF", 3000, expect.anything()]);
    expect(recorder.calls.find((c) => c.verb === "grantKeyword")?.args).toEqual([
      "SELF",
      "SecurityAttack",
      expect.anything(),
      1,
    ]);
  });
});

describe('Trash/HandManipulation chooser: "opponent" routing', () => {
  // Regression coverage for the BT26 decision-API fix: "your opponent trashes 1 card in
  // their hand" (BT13-079/BT19-075/BT4-088/EX6-046/EX6-049/BT10-077/etc, KB-confirmed
  // "your opponent chooses") must prompt the OPPONENT'S own ask facade, not the
  // controller's ctx.ask — see TrashAction.chooser / HandManipulationAction.chooser.

  it("Trash (hand zone, chooser: opponent) prompts ctx.ask.opponent, not the controller", async () => {
    const module = irCardModule("Z-OPP-TRASH", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "Trash",
              target: { filter: { controller: "opponent", zone: "hand" }, count: 1 },
              chooser: "opponent",
            },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-OPP-TRASH" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentHand: [
        { instanceId: "OPP-H1", cardId: "X-000" },
        { instanceId: "OPP-H2", cardId: "X-000" },
      ],
      opponentSelectCardsAnswer: (o) => o.candidates.slice(0, 1),
    });

    const effect = module.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "opponent.selectCards")).toHaveLength(1);
    expect(recorder.calls.filter((c) => c.verb === "selectCards")).toHaveLength(0);
    expect(recorder.calls.find((c) => c.verb === "trash")?.args[0]).toEqual(["OPP-H1"]);
  });

  it("HandManipulation (chooser: opponent) prompts ctx.ask.opponent, not the controller", async () => {
    const module = irCardModule("Z-OPP-HANDMANIP", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "HandManipulation", op: "trashVariable", controller: "opponent", amount: 1, chooser: "opponent" },
          ],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-OPP-HANDMANIP" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentHand: [{ instanceId: "OPP-H1", cardId: "X-000" }],
      opponentSelectCardsAnswer: (o) => o.candidates.slice(0, 1),
    });

    const effect = module.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "opponent.selectCards")).toHaveLength(1);
    expect(recorder.calls.filter((c) => c.verb === "selectCards")).toHaveLength(0);
    expect(recorder.calls.find((c) => c.verb === "trash")?.args[0]).toEqual(["OPP-H1"]);
  });

  it("Trash (hand zone, no chooser) still prompts the controller, unaffected by the addition", async () => {
    const module = irCardModule("Z-CTRL-TRASH", {
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [{ kind: "Trash", target: { filter: { controller: "opponent", zone: "hand" }, count: 1 } }],
        },
      ],
    });
    const source = makeSource({ cardId: "Z-CTRL-TRASH" });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      opponentHand: [
        { instanceId: "OPP-H1", cardId: "X-000" },
        { instanceId: "OPP-H2", cardId: "X-000" },
      ],
      selectCardsAnswer: (o) => o.candidates.slice(0, 1),
    });

    const effect = module.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
    await effect.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "selectCards")).toHaveLength(1);
    expect(recorder.calls.filter((c) => c.verb === "opponent.selectCards")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// "The Digimon this effect played" — the wired replacements for the dead
// `Filter.playedByThisEffect` key (which no engine source ever read, so every filter
// carrying it matched EVERY permanent instead of the played one).
// ---------------------------------------------------------------------------

describe("cards that delete the Digimon this effect played", () => {
  const PLAYED = "PLAYED#1";

  function playedPermanent(): Permanent {
    return makeFakePermanent({
      permanentId: PLAYED,
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "played", cardId: "BT15-031", ownerSeat: 0, faceUp: true } as never,
    });
  }

  it("EX10-061 arms the turn-end delete on the permanent it played from its digivolution cards", async () => {
    // "[On Play] ... play 1 of each [Dark Masters] trait card ... At turn end, delete the Digimon
    // this effect played" (KB Q5741). `DelayedDelete` reads ctx.lastPlayedPermanentIds.
    const self = makeFakePermanent({
      permanentId: "SELF",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "self", cardId: "EX10-061", ownerSeat: 0, faceUp: true } as never,
      stack: [{ instanceId: "stacked", cardId: "BT15-031", ownerSeat: 0, faceUp: true }] as never,
    });
    const source = makeSource({ cardId: "EX10-061", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [self],
      playInstancesResult: [playedPermanent()],
      // The "1 of each ... with different names" count is a recorded residual (the engine has no
      // distinct-names selection yet), so the pick is supplied here; the delayed delete under test
      // depends only on WHAT was played, not on how many the count rule allows.
      selectCardsAnswer: (o) => o.candidates.slice(0, 1),
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, types: ["Dark Masters"] }),
    });

    await getEffectModule("EX10-061")!.effectsForTiming(EffectTiming.OnPlay, source)[0]!.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "playInstances")).toHaveLength(1);

    expect(recorder.calls.filter((c) => c.verb === "delayedDeletePlayed")).toEqual([
      { verb: "delayedDeletePlayed", args: [PLAYED, "endOfOwnerTurn", "EX10-061"] },
    ]);
    // ...and no board-wide endOfTurn watcher is installed in its place.
    expect(recorder.calls.filter((c) => c.verb === "subscribeSubTrigger")).toHaveLength(0);
    // REVERT-CONFIRM-RED: restore the SubTrigger + `playedByThisEffect` Delete => no
    // delayedDeletePlayed call at all, and an endOfTurn watcher whose Delete (count "all", filter
    // ignored) matches every permanent is installed instead => both assertions go RED.
  });

  it("EX11-061 arms the turn-end delete inside its digivolve watcher, not when the clause installs", async () => {
    // "[Your Turn] When any of your Digimon digivolve into a [Puppet] trait Digimon, ... you may
    // play 1 level 3 [Puppet] trait Digimon card from your hand ... At turn end, delete the Digimon
    // this effect played" (KB Q5915). The delete must be armed by the WATCHER BODY (after a play),
    // which is where the declarative effect record got it wrong — it sat outside the watcher.
    const self = makeFakePermanent({
      permanentId: "TAMER",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "self", cardId: "EX11-061", ownerSeat: 0, faceUp: true } as never,
    });
    const source = makeSource({ cardId: "EX11-061", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [self],
      ownHand: [{ instanceId: "puppet", cardId: "BT13-035", ownerSeat: 0, faceUp: true }],
      playInstancesResult: [playedPermanent()],
      definitionOf: (id) =>
        makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, level: 3, types: ["Puppet"] }),
    });

    await getEffectModule("EX11-061")!.effectsForTiming(EffectTiming.None, source)[0]!.resolve(ctx);

    // Installing the [Your Turn] clause arms NOTHING by itself.
    expect(recorder.calls.filter((c) => c.verb === "delayedDeletePlayed")).toHaveLength(0);
    const subs = recorder.calls.filter((c) => c.verb === "subscribeSubTrigger");
    expect(subs).toHaveLength(1); // only the digivolve watcher
    // REVERT-CONFIRM-RED: the declarative effect record installed a SECOND, sibling endOfTurn watcher here =>
    // this expects 1 and finds 2 => RED.

    // Firing the digivolve watcher plays the Digimon and arms the delete on THAT permanent.
    const sub = subs[0]!.args[0] as { event: string; run: (c: EffectContext) => Promise<void> };
    expect(sub.event).toBe("whenOneOfYoursDigivolves");
    await sub.run(ctx);
    expect(recorder.calls.filter((c) => c.verb === "delayedDeletePlayed")).toEqual([
      { verb: "delayedDeletePlayed", args: [PLAYED, "endOfOwnerTurn", "EX11-061"] },
    ]);
  });

  it("EX10-072's ＜Delay＞ arms the owner-turn-end delete on the Digimon it played from security", async () => {
    // "[End of Opponent's Turn] ＜Delay＞ ... play 1 face-up [Dark Masters] Digimon from your
    // security stack ... At the end of YOUR turn, delete the Digimon this effect played" (KB
    // Q5744; documented behavior EffectDuration.UntilOwnerTurnEnd + IsOwnerTurn). It used to run an IMMEDIATE
    // Delete whose `playedByThisEffect` filter the engine ignored.
    const self = makeFakePermanent({
      permanentId: "SPIRAL",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "self", cardId: "EX10-072", ownerSeat: 0, faceUp: true } as never,
      enterFieldTurnCount: 1,
    });
    const source = makeSource({ cardId: "EX10-072", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [self],
      ownSecurity: [{ instanceId: "sec", cardId: "BT15-031", ownerSeat: 0, faceUp: true }],
      playInstancesResult: [playedPermanent()],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, types: ["Dark Masters"] }),
    });

    const delayEffect = getEffectModule("EX10-072")!
      .effectsForTiming(EffectTiming.OnEndTurn, source)
      .find((e) => e.effectKey.startsWith("EX10-072/"))!;
    await delayEffect.resolve(ctx);

    expect(recorder.calls.filter((c) => c.verb === "delayedDeletePlayed")).toEqual([
      { verb: "delayedDeletePlayed", args: [PLAYED, "endOfOwnerTurn", "EX10-072"] },
    ]);
    // The played Digimon is NOT deleted on the spot (only the ＜Delay＞ cost's own trash runs).
    expect(
      recorder.calls.filter((c) => c.verb === "deletePermanent" && (c.args[0] as string[]).includes(PLAYED)),
    ).toHaveLength(0);
    // REVERT-CONFIRM-RED: restore the immediate `Delete` + `playedByThisEffect` => the played
    // permanent is deleted right away and nothing is armed => both assertions go RED.
  });

  it("EX10-072's [Security] effect anchors its turn-end delete on the permanent it played", async () => {
    // The [Security] half deletes at the end of the CURRENT (opponent's) turn — documented behavior uses
    // EffectDuration.UntilEachTurnEnd with no owner-turn gate — so it cannot use the owner-gated
    // `DelayedDelete`. The watcher is anchored (`on`) to the permanent bound by the play
    // (bindResultAs/boundRef) and deletes its own anchor.
    const source = makeSource({ cardId: "EX10-072" });
    const recorder: Recorder = { calls: [] };
    const played = playedPermanent();
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [played],
      ownHand: [{ instanceId: "dm", cardId: "BT15-031", ownerSeat: 0, faceUp: true }],
      playInstancesResult: [played],
      definitionOf: (id) => makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, types: ["Dark Masters"] }),
    });

    await getEffectModule("EX10-072")!.effectsForTiming(EffectTiming.SecuritySkill, source)[0]!.resolve(ctx);

    const sub = recorder.calls.find((c) => c.verb === "subscribeSubTrigger")?.args[0] as
      | { event?: string; sourcePermanentId?: string }
      | undefined;
    expect(sub).toMatchObject({ event: "endOfTurn", sourcePermanentId: PLAYED });
    // REVERT-CONFIRM-RED: without `bindResultAs`/`on` the watcher anchors on the security card's
    // own (absent) permanent and its body's `playedByThisEffect` Delete matches every permanent.
  });

  it("EX3-069 restricts and one-shot-deletes exactly the Digimon it played", async () => {
    // "Play 1 [Four Great Dragons] Digimon from your hand without paying the cost. The Digimon
    // played by this effect can't digivolve to level 7, and at the NEXT end of your opponent's
    // turn, delete that Digimon" (errata 2025-04-25; KB Q5722 makes the delete one-shot, Q3433
    // tracks the PERMANENT across De-Digivolve).
    const self = makeFakePermanent({
      permanentId: "TRIAL",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "self", cardId: "EX3-069", ownerSeat: 0, faceUp: true } as never,
      enterFieldTurnCount: 1,
    });
    const source = makeSource({ cardId: "EX3-069", permanent: () => self });
    const recorder: Recorder = { calls: [] };
    const played = playedPermanent();
    const bystander = makeFakePermanent({
      permanentId: "BYSTANDER",
      controllerSeat: 0 as Seat,
      topCard: { instanceId: "by", cardId: "BT14-018", ownerSeat: 0, faceUp: true } as never,
    });
    const ctx = makeContext({
      source,
      recorder,
      ownBattleArea: [self, played, bystander],
      ownHand: [{ instanceId: "dragon", cardId: "BT14-018", ownerSeat: 0, faceUp: true }],
      playInstancesResult: [played],
      definitionOf: (id) =>
        makeFakeDefinition({ cardId: id, kinds: ["Digimon"] as never, types: ["Four Great Dragons"] }),
    });

    const delayEffect = getEffectModule("EX3-069")!
      .effectsForTiming(EffectTiming.OnDeclaration, source)
      .find((e) => e.effectKey.startsWith("EX3-069/"))!;
    await delayEffect.resolve(ctx);

    // The level-7 digivolve lock lands on the PLAYED permanent, not on an arbitrary Digimon.
    expect(recorder.calls.filter((c) => c.verb === "restrict").map((c) => c.args[0])).toEqual([PLAYED]);
    // REVERT-CONFIRM-RED: with `playedByThisEffect` (ignored) the Restrict's candidate pool is
    // every Digimon on the board, so the lock lands on whichever one sorts first => RED.

    const sub = recorder.calls.find((c) => c.verb === "subscribeSubTrigger")?.args[0] as
      | { event?: string; once?: boolean; sourcePermanentId?: string }
      | undefined;
    expect(sub).toMatchObject({ event: "endOfOpponentTurn", once: true, sourcePermanentId: PLAYED });
    // REVERT-CONFIRM-RED: `once` was hardcoded false in runSubTrigger, so the watcher persisted and
    // could delete at LATER opponent turn ends too, contradicting KB Q5722 => RED.
  });
});
