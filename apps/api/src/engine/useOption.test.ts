import { afterEach, describe, it, expect } from "vitest";
import {
  EffectTiming,
  compiledEffects,
  type CardDefinition,
  type CompiledCard,
  type Permanent,
  type Seat,
} from "@aegis/shared";
import type { CardSource } from "./effects/CardSource.js";
import type { DecisionApi, EffectContext, GameAccess, Primitives } from "./effects/EffectContext.js";
import { irCardModule, registerIrCard } from "./effects/interpreter.js";
import { getEffectModule } from "./effects/registry.js";
import { unregisterIrCard } from "#api/engine/effects/interpreter/registration/unregisterIrCard";

/**
 * A3 for the use-option-without-cost ENGINE PATH (EX8-037 / BT15-092 / BT16-094 / BT19-040).
 * Drives a `UseOptionWithoutCost` action through the REAL interpreter and asserts the shared
 * semantics the four consumers rely on (the cards themselves land in 08-06):
 *
 *   - A single-color, cost-<=5 Option in hand is enumerated server-side, its compiled [Main]
 *     effect RESOLVES under the using card's control (an observable state change happens), NO
 *     Option cost is charged, then the Option is trashed.
 *   - The use RESULT binds on ctx.lastOptionUsed at use-time (Q4738), so the 08-01
 *     `ifThisEffectUsed` Condition reads TRUE and a mandatory "if this effect used" tail runs.
 *   - whenOptionUsed fires on a successful use (arms BT19-040's token watcher) — a consume-site
 *     watcher proves it is not a dead store.
 *   - Eligibility is the SERVER's predicate: a two-color Option or one under a
 *     CanNotPlayThisOption restriction is never offered, while an uncapped cost-6 Option is valid.
 *
 * SECURITY (T-08-10/T-08-11): the engine fetches the chosen Option's compiled effect via
 * getCompiledCard; the client supplies only a choice among the engine-resolved candidates, never
 * an effect body. The fake's selectCards/chooseOption can only echo back an offered candidate.
 *
 * FAILS-WHEN-REVERTED: stub useOptionFromHand to a no-op (and drop the lastOptionUsed binding)
 * and the resolution + lastOptionUsed + tail assertions go RED — documented inline per test.
 */

let seq = 0;

function makeDefinition(over: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardId: "X-000",
    set: "X",
    nameEn: "X",
    kinds: ["Option"] as never,
    colors: ["Red"] as never,
    playCost: 3,
    dp: 0,
    evoCosts: [],
    maxCountInDeck: 4,
    ...over,
  };
}

function makePermanent(over: Partial<Permanent>): Permanent {
  seq += 1;
  return {
    permanentId: `p-${seq}`,
    controllerSeat: 0 as Seat,
    topCard: { instanceId: `i-${seq}`, cardId: "X-000", ownerSeat: 0 as Seat, faceUp: true } as never,
    stack: [] as never,
    linked: [] as never,
    baseDP: 3000,
    currentDP: 3000,
    isSuspended: true,
    inBreeding: false,
    ...over,
  } as unknown as Permanent;
}

function makeSource(): CardSource {
  return {
    instanceId: "SRC#1",
    cardId: "X-SRC",
    ownerSeat: 0 as Seat,
    definition: makeDefinition({ cardId: "X-SRC", kinds: ["Digimon"] as never }),
    permanent: () => undefined,
    isOnBattleArea: () => true,
    isOwnersTurn: () => true,
    hasColor: () => false,
  };
}

interface HandCard {
  instanceId: string;
  cardId: string;
  ownerSeat: Seat;
  faceUp: boolean;
}

interface Recorder {
  calls: string[];
  /** memory deltas applied via gainMemory (a "cost charged" would be a NEGATIVE delta). */
  memoryDeltas: number[];
  /** instance ids passed to trash. */
  trashed: string[];
  /** subjects passed to fireOptionUsed. */
  optionUsedSubjects: string[];
}

/**
 * The compiled-card store the real interpreter reads via getCompiledCard (the shared
 * `compiledEffects` registry). The test seeds each Option's [Main] effect here so the engine
 * fetches it SERVER-SIDE (never the client) exactly as production does. Definitions are looked
 * up via the fake `definitionOf` (colors/cost for the server eligibility predicate).
 */
const definitions = new Map<string, CardDefinition>();
const seededCardIds: string[] = [];

function seedOption(cardId: string, def: Partial<CardDefinition>, main: CompiledCard): void {
  definitions.set(cardId, makeDefinition({ cardId, ...def }));
  (compiledEffects as Record<string, CompiledCard>)[cardId] = main;
  // Also register through the shared `registerCard` registry (`registerIrCard`), the same path
  // resolves the USED card's effect via that registry (`getEffectModule`), not the raw
  // `compiledEffects` map alone — a hand-written module has no `compiledEffects` entry at all, so
  // the registry is the only path that reaches both card shapes. Seeding `compiledEffects` without
  // this would make the fake `useOptionFromHand` below the only thing keeping these tests green.
  registerIrCard(cardId, main);
  seededCardIds.push(cardId);
}

/** An Option whose [Main] effect gains 2 memory — the observable "the Option resolved" signal. */
function gainMemoryMain(): CompiledCard {
  return {
    coverage: "full",
    effects: [{ trigger: "Main", actions: [{ kind: "GainMemory", amount: 2 }] }],
  } as unknown as CompiledCard;
}

function makeContext(opts: {
  recorder: Recorder;
  ownHand: HandCard[];
  ownTrash?: HandCard[];
  selfSuspendedDigimon?: Permanent;
  /** seats the fake reports as play-prohibited for a given cardId (CanNotPlayThisOption). */
  prohibited?: Set<string>;
  colorRequirementMet?: boolean;
  effectiveUseCosts?: Readonly<Record<string, number>>;
}): EffectContext {
  const rec = opts.recorder;
  const ownArea = opts.selfSuspendedDigimon ? [opts.selfSuspendedDigimon] : [];
  const players = [
    { seat: 0, battleArea: ownArea, security: [], hand: opts.ownHand, deck: [], trash: opts.ownTrash ?? [] },
    { seat: 1, battleArea: [], security: [], hand: [], deck: [], trash: [] },
  ];
  const game: GameAccess = {
    state: { memory: 0, players, turnSeat: 0 } as never,
    player: (seat: Seat) => players[seat] as never,
    opponentOf: (s) => (s === 0 ? 1 : 0),
    permanentById: (id) => ownArea.find((p) => p.permanentId === id),
    // Seeded Option defs override; anything else (the self Digimon's top card) defaults to a Digimon.
    definitionOf: (card) =>
      definitions.get(card.cardId) ?? makeDefinition({ cardId: card.cardId, kinds: ["Digimon"] as never }),
    linkMax: () => 1,
    optionColorRequirementMet: () => opts.colorRequirementMet ?? true,
  };
  const fx = {
    gainMemory: (n: number) => {
      rec.calls.push("gainMemory");
      rec.memoryDeltas.push(n);
    },
    gainMemoryForSeat: (_seat: Seat, n: number) => {
      rec.calls.push("gainMemory");
      rec.memoryDeltas.push(n);
    },
    fireOptionUsed: async (subject: string) => {
      rec.calls.push("fireOptionUsed");
      rec.optionUsedSubjects.push(subject);
    },
    // The Option-use lifecycle verb (the lever): resolve the used card's registered OnUseOption
    // effect (via the shared registry, faithful to the real primitive's `resolveCardEffect`),
    // then trash the Option + fire whenOptionUsed (the real primitive trashes then fires
    // whenOptionUsed, so the fire is co-located).
    useOptionFromHand: async (subCtx: EffectContext, instanceId: string) => {
      const usedCardId = [...opts.ownHand, ...(opts.ownTrash ?? [])].find((c) => c.instanceId === instanceId)?.cardId;
      if (usedCardId !== undefined) {
        subCtx.lastOptionUsed = true;
        const usedModule = getEffectModule(usedCardId);
        for (const effect of usedModule?.effectsForTiming(EffectTiming.OnUseOption, subCtx.source) ?? []) {
          await effect.resolve(subCtx);
        }
      }
      rec.calls.push("useOptionFromHand");
      rec.trashed.push(instanceId);
      rec.calls.push("fireOptionUsed");
      rec.optionUsedSubjects.push(instanceId);
      return [];
    },
    unsuspend: async (ids: string[]) => {
      rec.calls.push("unsuspend");
      void ids;
    },
    isPlayProhibited: (_seat: Seat, cardId: string) => opts.prohibited?.has(cardId) ?? false,
    effectiveLooseUseCost: (instanceId: string) => opts.effectiveUseCosts?.[instanceId],
  } as unknown as Primitives;

  const ask: DecisionApi = {
    optional: async () => true,
    chooseTargets: async (_ctx, o) => o.candidates.slice(0, o.max),
    selectPermanents: async (_ctx, o) => o.candidates.slice(0, o.max),
    // The client can only pick AMONG the engine-offered candidates (it never supplies effects).
    selectCards: async (_ctx, o) => o.candidates.slice(0, o.max),
    chooseOption: async () => 0,
  };

  return {
    source: makeSource(),
    trigger: {},
    game,
    fx,
    ask,
    selections: new Map<string, string>(),
  };
}

/** IR: use 1 explicitly single-color Option from hand for free; if used, unsuspend. */
function useOptionThenUnsuspendCompiled(): CompiledCard {
  return {
    coverage: "full",
    effects: [
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "UseOptionWithoutCost",
            filter: { controller: "mine", kind: ["Option"], colors: undefined, singleColor: true },
            payCost: false,
            from: ["hand"],
          },
          {
            kind: "Unsuspend",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            condition: { kind: "ifThisEffectUsed" },
          },
        ],
      },
    ],
  } as unknown as CompiledCard;
}

/** IR identical to the above but sourcing the Option from the TRASH (`from: ["trash"]`). */
function useOptionFromTrashThenUnsuspendCompiled(): CompiledCard {
  return {
    coverage: "full",
    effects: [
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "UseOptionWithoutCost",
            filter: { controller: "mine", kind: ["Option"], colors: undefined },
            payCost: false,
            from: ["trash"],
          },
          {
            kind: "Unsuspend",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            condition: { kind: "ifThisEffectUsed" },
          },
        ],
      },
    ],
  } as unknown as CompiledCard;
}

function resetStores(): void {
  definitions.clear();
  for (const id of seededCardIds) {
    unregisterIrCard(id);
  }
  seededCardIds.length = 0;
}

afterEach(resetStores);

describe("use-option-without-cost engine path", () => {
  it("resolves an eligible Option's [Main] effect, charges no cost, trashes it, binds lastOptionUsed, fires whenOptionUsed, and runs the mandatory tail", async () => {
    resetStores();
    seedOption("OPT-RED-3", { colors: ["Red"] as never, playCost: 3 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-opt", cardId: "OPT-RED-3", ownerSeat: 0 as Seat, faceUp: true }],
      selfSuspendedDigimon: makePermanent({ controllerSeat: 0 as Seat, isSuspended: true }),
    });

    const effects = irCardModule("X-USER", useOptionThenUnsuspendCompiled()).effectsForTiming(
      EffectTiming.OnPlay,
      ctx.source,
    );
    await effects[0]!.resolve(ctx);

    // The Option's [Main] effect RESOLVED (its observable state change: +2 memory).
    expect(rec.calls).toContain("gainMemory");
    expect(rec.memoryDeltas).toContain(2);
    // NO Option cost charged (no negative memory delta — the use was free).
    expect(rec.memoryDeltas.every((d) => d >= 0)).toBe(true);
    // The Option went to trash via the use verb.
    expect(rec.calls).toContain("useOptionFromHand");
    expect(rec.trashed).toContain("h-opt");
    // The use RESULT bound on ctx (Q4738) and whenOptionUsed fired (BT19-040 watcher).
    expect(ctx.lastOptionUsed).toBe(true);
    expect(rec.calls).toContain("fireOptionUsed");
    expect(rec.optionUsedSubjects).toContain("h-opt");
    // The mandatory "if this effect used" tail ran (the unsuspend).
    // FAILS-WHEN-REVERTED: stub useOptionFromHand to a no-op and drop the lastOptionUsed binding
    // => gainMemory/lastOptionUsed/unsuspend all go RED.
    expect(rec.calls).toContain("unsuspend");
  });

  it("rejects a TWO-COLOR Option when the printed filter requires single-color: nothing resolves, lastOptionUsed FALSE, tail skipped", async () => {
    resetStores();
    seedOption("OPT-MULTI", { colors: ["Red", "Blue"] as never, playCost: 3 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-multi", cardId: "OPT-MULTI", ownerSeat: 0 as Seat, faceUp: true }],
      selfSuspendedDigimon: makePermanent({ controllerSeat: 0 as Seat, isSuspended: true }),
    });

    const effects = irCardModule("X-USER", useOptionThenUnsuspendCompiled()).effectsForTiming(
      EffectTiming.OnPlay,
      ctx.source,
    );
    await effects[0]!.resolve(ctx);

    expect(rec.calls).not.toContain("useOptionFromHand");
    expect(rec.calls).not.toContain("gainMemory");
    expect(ctx.lastOptionUsed).toBe(false);
    expect(rec.calls).not.toContain("unsuspend");
  });

  it("rejects a COST-6 Option (server eligibility): nothing resolves, tail skipped", async () => {
    resetStores();
    seedOption("OPT-EXP", { colors: ["Red"] as never, playCost: 6 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-exp", cardId: "OPT-EXP", ownerSeat: 0 as Seat, faceUp: true }],
      selfSuspendedDigimon: makePermanent({ controllerSeat: 0 as Seat, isSuspended: true }),
    });

    const ir = useOptionThenUnsuspendCompiled();
    const useAction = ir.effects[0]?.actions[0];
    if (useAction?.kind !== "UseOptionWithoutCost") throw new Error("UseOption action missing");
    useAction.filter = { ...useAction.filter, playCostLte: 5 };
    const effects = irCardModule("X-USER", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(rec.calls).not.toContain("useOptionFromHand");
    expect(ctx.lastOptionUsed).toBe(false);
    expect(rec.calls).not.toContain("unsuspend");
  });

  it("rejects an Option under a CanNotPlayThisOption restriction (isPlayProhibited): tail skipped", async () => {
    resetStores();
    seedOption("OPT-LOCKED", { colors: ["Red"] as never, playCost: 2 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-lock", cardId: "OPT-LOCKED", ownerSeat: 0 as Seat, faceUp: true }],
      selfSuspendedDigimon: makePermanent({ controllerSeat: 0 as Seat, isSuspended: true }),
      prohibited: new Set(["OPT-LOCKED"]),
    });

    const effects = irCardModule("X-USER", useOptionThenUnsuspendCompiled()).effectsForTiming(
      EffectTiming.OnPlay,
      ctx.source,
    );
    await effects[0]!.resolve(ctx);

    expect(rec.calls).not.toContain("useOptionFromHand");
    expect(ctx.lastOptionUsed).toBe(false);
  });

  it("honors an explicit color waiver on the granting UseOptionWithoutCost action", async () => {
    resetStores();
    seedOption("OPT-OFF-COLOR", { colors: ["White"] as never, playCost: 2 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-off-color", cardId: "OPT-OFF-COLOR", ownerSeat: 0 as Seat, faceUp: true }],
      colorRequirementMet: false,
    });
    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"] },
              payCost: false,
              waiveColorRequirement: true,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-WAIVER", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(rec.trashed).toContain("h-off-color");
    expect(ctx.lastOptionUsed).toBe(true);
  });

  // WR-02 (fails-when-reverted): with `from: ["trash"]`, the chosen Option lives in the trash, not
  // the hand. The chosen-card retrieval must resolve from the SAME zone set used to gather
  // candidates. Reverting the fix (retrieving from "hand" only) leaves chosenCard undefined, so the
  // borrowed [Main] effect never runs even though the Option is still consumed and lastOptionUsed
  // is set — the gainMemory/tail assertions go RED.
  it("resolves an eligible Option sourced from the TRASH (from: ['trash']), not just the hand", async () => {
    resetStores();
    seedOption("OPT-TRASH-2", { colors: ["Red"] as never, playCost: 2 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [],
      ownTrash: [{ instanceId: "t-opt", cardId: "OPT-TRASH-2", ownerSeat: 0 as Seat, faceUp: true }],
      selfSuspendedDigimon: makePermanent({ controllerSeat: 0 as Seat, isSuspended: true }),
    });

    const effects = irCardModule("X-USER", useOptionFromTrashThenUnsuspendCompiled()).effectsForTiming(
      EffectTiming.OnPlay,
      ctx.source,
    );
    await effects[0]!.resolve(ctx);

    expect(rec.calls).toContain("gainMemory"); // the trash-sourced Option's [Main] resolved
    expect(rec.memoryDeltas).toContain(2);
    expect(rec.calls).toContain("useOptionFromHand"); // consumed via the use verb
    expect(rec.trashed).toContain("t-opt");
    expect(ctx.lastOptionUsed).toBe(true);
    expect(rec.calls).toContain("unsuspend"); // the mandatory "if used" tail ran
  });

  // Gap #1 fix: UseOptionWithoutCost payCost:true + reduceCostBy (BT17-035 / EX12 family).
  it("payCost:true + reduceCostBy: charges max(0, playCost - reduceCostBy) before effect resolves", async () => {
    resetStores();
    // Option with printed cost 5; reduceCostBy:2 → player pays 3
    seedOption("OPT-COST5", { colors: ["Blue"] as never, playCost: 5 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-c5", cardId: "OPT-COST5", ownerSeat: 0 as Seat, faceUp: true }],
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"] },
              payCost: true,
              reduceCostBy: 2,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-PAYER", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(ctx.lastOptionUsed).toBe(true);
    // The Option's [Main] ran (+2 memory delta from the effect body).
    expect(rec.memoryDeltas).toContain(2);
    // The cost payment: -3 (= -(5-2)) memory delta, applied BEFORE the +2 effect delta.
    expect(rec.memoryDeltas).toContain(-3);
    // Cost comes before effect resolution.
    const costIdx = rec.memoryDeltas.indexOf(-3);
    const effectIdx = rec.memoryDeltas.indexOf(2);
    expect(costIdx).toBeLessThan(effectIdx);
  });

  it("payCost:true + reduceCostBy: floors cost at 0 when reduceCostBy >= playCost", async () => {
    resetStores();
    // Option with printed cost 1; reduceCostBy:2 → effective cost 0, no payment
    seedOption("OPT-CHEAP", { colors: ["Red"] as never, playCost: 1 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-cheap", cardId: "OPT-CHEAP", ownerSeat: 0 as Seat, faceUp: true }],
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"] },
              payCost: true,
              reduceCostBy: 3,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-PAYER2", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(ctx.lastOptionUsed).toBe(true);
    // No negative memory delta — effective cost is 0
    expect(rec.memoryDeltas.every((d) => d >= 0)).toBe(true);
  });

  it("playCostLte on filter raises the cost cap beyond the historical 5", async () => {
    resetStores();
    // Option with cost 7 — eligible when the explicit cap is 10
    seedOption("OPT-COST7", { colors: ["Red"] as never, playCost: 7 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-c7", cardId: "OPT-COST7", ownerSeat: 0 as Seat, faceUp: true }],
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"], playCostLte: 10 },
              payCost: false,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-CAPTEST", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    // The cost-7 Option IS offered because the cap is 10
    expect(ctx.lastOptionUsed).toBe(true);
    expect(rec.trashed).toContain("h-c7");
  });

  it("allows a cost-6 Option when no play-cost cap is declared", async () => {
    resetStores();
    seedOption("OPT-6", { colors: ["Red"] as never, playCost: 6 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-6", cardId: "OPT-6", ownerSeat: 0 as Seat, faceUp: true }],
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"] },
              payCost: false,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-CAP5", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    // No cap declared → no artificial ceiling, so cost-6 is offered and used.
    expect(ctx.lastOptionUsed).toBe(true);
    expect(rec.calls).toContain("useOptionFromHand");
    expect(rec.trashed).toContain("h-6");
  });

  it("still rejects a cost-6 Option when an explicit playCostLte 5 is declared", async () => {
    resetStores();
    seedOption("OPT-6-CAPPED", { colors: ["Red"] as never, playCost: 6 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-6-capped", cardId: "OPT-6-CAPPED", ownerSeat: 0 as Seat, faceUp: true }],
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"], playCostLte: 5 },
              payCost: false,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-CAP5", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(ctx.lastOptionUsed).toBe(false);
    expect(rec.calls).not.toContain("useOptionFromHand");
  });

  it("applies a use-cost cap to the candidate's live in-hand use cost", async () => {
    resetStores();
    seedOption("OPT-LIVE-COST", { colors: ["Red"] as never, playCost: 2 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-live-cost", cardId: "OPT-LIVE-COST", ownerSeat: 0 as Seat, faceUp: true }],
      effectiveUseCosts: { "h-live-cost": 3 },
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"], playCostLte: 2 },
              payCost: false,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-LIVE-COST-CAP", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(ctx.lastOptionUsed).toBe(false);
    expect(rec.calls).not.toContain("useOptionFromHand");
  });

  it("keeps exact Option cost filters tied to the printed cost", async () => {
    resetStores();
    seedOption("OPT-PRINTED-SEVEN", { colors: ["Red"] as never, playCost: 7 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [{ instanceId: "h-printed-seven", cardId: "OPT-PRINTED-SEVEN", ownerSeat: 0 as Seat, faceUp: true }],
      effectiveUseCosts: { "h-printed-seven": 6 },
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: { controller: "mine", kind: ["Option"], playCostOneOf: [7] },
              payCost: false,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-PRINTED-EXACT-COST", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(ctx.lastOptionUsed).toBe(true);
    expect(rec.calls).toContain("useOptionFromHand");
  });

  it("applies live use-cost ceilings inside nested Option filter branches", async () => {
    resetStores();
    seedOption("OPT-NESTED-LIVE-COST", { colors: ["Yellow"] as never, playCost: 2 }, gainMemoryMain());
    const rec: Recorder = { calls: [], memoryDeltas: [], trashed: [], optionUsedSubjects: [] };
    const ctx = makeContext({
      recorder: rec,
      ownHand: [
        { instanceId: "h-nested-live-cost", cardId: "OPT-NESTED-LIVE-COST", ownerSeat: 0 as Seat, faceUp: true },
      ],
      effectiveUseCosts: { "h-nested-live-cost": 6 },
    });

    const ir: CompiledCard = {
      coverage: "full",
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "UseOptionWithoutCost",
              filter: {
                controller: "mine",
                kind: ["Option"],
                playCostLte: 99,
                or: [{ nameOrTrait: [{ tokens: ["Plug-In"], match: "name" }] }, { colors: ["Yellow"], playCostLte: 5 }],
              },
              payCost: false,
              from: ["hand"],
            },
          ],
        },
      ],
    } as unknown as CompiledCard;

    const effects = irCardModule("X-NESTED-LIVE-COST-CAP", ir).effectsForTiming(EffectTiming.OnPlay, ctx.source);
    await effects[0]!.resolve(ctx);

    expect(ctx.lastOptionUsed).toBe(false);
    expect(rec.calls).not.toContain("useOptionFromHand");
  });
});
