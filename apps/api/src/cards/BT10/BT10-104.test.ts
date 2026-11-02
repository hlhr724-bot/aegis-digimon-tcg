import { describe, it, expect } from "vitest";
import { CardKind, EffectTiming, type CardDefinition, type GameState, type Permanent, type Seat } from "@aegis/shared";
import { getEffectModule } from "../../engine/effects/registry.js";
import type { CardSource } from "../../engine/effects/CardSource.js";
import type { DecisionApi, EffectContext, GameAccess, Primitives } from "../../engine/effects/EffectContext.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./BT10-104.js";

const CARD_ID = "BT10-104";

function fakeDef(over: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardId: over.cardId ?? CARD_ID,
    set: "BT10",
    nameEn: over.nameEn ?? "Immortal Ruler",
    kinds: (over.kinds as never) ?? (["Option"] as never),
    colors: (over.colors as never) ?? (["Black"] as never),
    playCost: over.playCost ?? 5,
    dp: 0,
    evoCosts: [],
    maxCountInDeck: 4,
    ...over,
  };
}

function makePermanent(permanentId: string, seat: Seat, cardId: string): Permanent {
  return {
    permanentId,
    controllerSeat: seat,
    topCard: { instanceId: `${permanentId}-top`, cardId, ownerSeat: seat },
    stack: [] as never,
    linked: [] as never,
    baseDP: 5000,
    currentDP: 5000,
    isSuspended: false,
    inBreeding: false,
  } as unknown as Permanent;
}

function makeSource(over: Partial<CardSource> = {}): CardSource {
  return {
    instanceId: "inst-immortal-ruler",
    cardId: CARD_ID,
    ownerSeat: 0 as Seat,
    definition: fakeDef(),
    permanent: () => undefined,
    isOnBattleArea: () => false,
    isOwnersTurn: () => true,
    hasColor: () => false,
    ...over,
  };
}

interface FxRecord {
  revealCalls: { seat: Seat; n: number }[];
  trashCalls: string[][];
  playInstancesCalls: { ids: string[]; opts: { payCost?: boolean } }[];
  returnToHandCalls: string[][];
  waiveColorRequirementCalls: string[];
}

function makeContext(opts: {
  source?: CardSource;
  ownerBattleArea?: Permanent[];
  ownerHand?: { instanceId: string; cardId: string }[];
  ownerTrash?: { instanceId: string; cardId: string }[];
  ownerSecurity?: { instanceId: string; cardId: string; ownerSeat: Seat }[];
  ownerDeck?: { instanceId: string; cardId: string }[];
  definitions?: Record<string, Partial<CardDefinition>>;
  record?: FxRecord;
  revealReturns?: { instanceId: string; cardId: string }[];
}): EffectContext {
  const {
    source,
    ownerBattleArea = [],
    ownerHand = [],
    ownerTrash = [],
    ownerSecurity = [],
    ownerDeck = [],
    definitions = {},
    record = {
      revealCalls: [],
      trashCalls: [],
      playInstancesCalls: [],
      returnToHandCalls: [],
      waiveColorRequirementCalls: [],
    },
    revealReturns = [],
  } = opts;

  const players = [
    {
      seat: 0 as Seat,
      battleArea: ownerBattleArea,
      hand: ownerHand,
      trash: ownerTrash,
      security: ownerSecurity,
      deck: ownerDeck,
    },
    { seat: 1 as Seat, battleArea: [], hand: [], trash: [], security: [], deck: [] },
  ];
  const state = { memory: 0, players, turnSeat: 0 as Seat } as unknown as GameState;

  const game: GameAccess = {
    state,
    player: (seat: Seat) => players[seat] as never,
    opponentOf: (s) => (s === 0 ? 1 : 0),
    permanentById: (id) => ownerBattleArea.find((p) => p.permanentId === id),
    definitionOf: (card: { cardId: string }) => {
      const over = definitions[card.cardId] ?? {};
      return fakeDef({ cardId: card.cardId, ...over });
    },
  };

  const fx: Primitives = {
    reveal: async (seat: Seat, n: number) => {
      record.revealCalls.push({ seat, n });
      return revealReturns
        .slice(0, n)
        .map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, ownerSeat: 0, faceUp: true }) as never);
    },
    trash: async (ids: string[]) => {
      record.trashCalls.push([...ids]);
      return [];
    },
    playInstances: async (ids: string[], opts?: { payCost?: boolean }) => {
      record.playInstancesCalls.push({ ids: [...ids], opts: opts ?? {} });
      return [];
    },
    returnToHand: async (ids: string[]) => {
      record.returnToHandCalls.push([...ids]);
      return [];
    },
    waiveColorRequirement: (instanceId: string) => {
      record.waiveColorRequirementCalls.push(instanceId);
    },
    fireOnDiscardLibrary: async () => {},
    fireWhenTrashedFromDeck: async () => {},
    draw: async () => [],
    gainMemory: () => {},
    gainMemoryForSeat: () => {},
    restrictMemoryGain: () => {},
    restrictCostReduction: () => {},
    declareWinner: () => {},
    setMemory: () => {},
    modifyDP: () => {},
    setBaseDP: () => {},
    playFromHand: async () => [],
    playFromSecurity: async () => undefined,
    digivolveFromInstance: async () => undefined,
    dnaDigivolveInto: async () => undefined,
    deDigivolve: () => [],
    placeUnder: async () => [],
    placeOwnTopAtStackBottom: () => false,
    relocatePermanent: () => false,
    link: async () => [],
    trashDigivolutionCards: async () => [],
    trashFromSecurity: async () => [],
    deletePermanent: async () => 0,
    suspend: async () => [],
    unsuspend: () => {},
    returnToDeck: async () => [],
    searchDeck: async () => [],
    addSecurity: async () => {},
    grantPierce: () => {},
    changeEvoCost: () => {},
    changePlayCost: () => {},
    grantNameTrait: () => {},
    grantKeyword: () => {},
    grantLinkMax: () => {},
    grantLinkCostReduction: () => {},
    shuffleSecurity: () => {},
    securityToHand: () => [],
    recoverToSecurity: async () => [],
    flipTopSecurity: () => false,
    flipSecurityFaceUp: () => false,
    forceAttack: async () => {},
    redirectAttack: async () => {},
    subscribeSubTrigger: () => 0,
    subscribeReplacement: () => 0,
    conferStackEffects: () => {},
    fireOptionUsed: async () => {},
    restrict: () => {},
    cannotIgnoreDigivolution: () => {},
    addColorGrant: () => {},
    movePermanentZone: async () => false,
    hatch: () => undefined,
    placeUnderFromEggDeck: async () => undefined,
    placeAsTopFromEggDeck: async () => undefined,
    endAttack: () => {},
    useOptionFromHand: async () => [],
  } as unknown as Primitives;

  const ask: DecisionApi = {
    optional: async () => true,
    chooseTargets: async (_c, o) => o.candidates.slice(0, o.max ?? 1),
    selectPermanents: async (_c, o) => o.candidates.slice(0, o.max ?? 1),
    selectCards: async (_c, o) => o.candidates.slice(0, o.max ?? 1),
    chooseOption: async () => 0,
  };

  return { source: source ?? makeSource(), trigger: {}, game, fx, ask };
}

describe("BT10-104 (Immortal Ruler)", () => {
  const module = getEffectModule(CARD_ID);

  it("is registered", () => {
    expect(module, "BT10-104 must self-register on import").toBeDefined();
  });

  it("plays DarkKnightmon for its DigiXros cost using materials from trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT10-092", "BT10-093"],
          hand: [{ card: "BT10-104", as: "option" }],
          deck: ["BT1-001", "BT1-002", "BT1-003"],
          trash: [
            { card: "BT10-066", as: "darkKnightmon" },
            { card: "BT1-001", as: "invalidMaterial" },
            { card: "BT7-058", as: "skullKnightmon" },
            { card: "BT7-059", as: "deadlyAxemon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT10-066"));

    const darkKnightmon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT10-066")!;
    expect(darkKnightmon.stack.map((card) => card.cardId)).toEqual(expect.arrayContaining(["BT7-058", "BT7-059"]));
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-001")).toBe(true);
    expect(s.state.memory).toBe(6);
  });

  it("Discord 1558458433970380820: keeps hand DigiXros materials alongside trash materials", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT10-092"],
          hand: [
            { card: "BT10-104", as: "option" },
            { card: "BT7-058", as: "handSkullKnightmon" },
          ],
          deck: ["BT1-001", "BT1-002", "BT1-003"],
          trash: [
            { card: "BT10-066", as: "darkKnightmon" },
            { card: "BT7-059", as: "trashDeadlyAxemon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT10-066"));

    const darkKnightmon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT10-066")!;
    expect(darkKnightmon.stack.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("handSkullKnightmon").instanceId, s.inst("trashDeadlyAxemon").instanceId]),
    );
    expect(s.state.memory).toBe(6);
  });

  it("routes [Main] to OnUseOption timing", () => {
    const source = makeSource();
    expect(module!.effectsForTiming(EffectTiming.OnUseOption, source).length).toBeGreaterThanOrEqual(1);
    expect(module!.effectsForTiming(EffectTiming.OnPlay, source)).toHaveLength(0);
  });

  it("installs its hand-resident color waiver while Nene Amano is in play", async () => {
    const source = makeSource();
    const record: FxRecord = {
      revealCalls: [],
      trashCalls: [],
      playInstancesCalls: [],
      returnToHandCalls: [],
      waiveColorRequirementCalls: [],
    };
    const ctx = makeContext({
      source,
      ownerBattleArea: [makePermanent("nene", 0 as Seat, "BT10-092")],
      definitions: {
        "BT10-092": {
          cardId: "BT10-092",
          nameEn: "Nene Amano",
          kinds: [CardKind.Tamer] as never,
        },
      },
      record,
    });
    const effect = module!.effectsForTiming(EffectTiming.None, source)[0]!;

    expect(effect.canTrigger(ctx)).toBe(true);
    await effect.resolve(ctx);
    expect(record.waiveColorRequirementCalls).toEqual([source.instanceId]);
  });

  it("[Main] trashes the top three deck cards without revealing them", async () => {
    const source = makeSource();
    const effects = module!.effectsForTiming(EffectTiming.OnUseOption, source);
    expect(effects.length).toBeGreaterThanOrEqual(1);

    const deckCards = [
      { instanceId: "deck-1", cardId: "BT1-001" },
      { instanceId: "deck-2", cardId: "BT1-002" },
      { instanceId: "deck-3", cardId: "BT1-003" },
    ];
    const record: FxRecord = {
      revealCalls: [],
      trashCalls: [],
      playInstancesCalls: [],
      returnToHandCalls: [],
      waiveColorRequirementCalls: [],
    };

    const ctx = makeContext({
      source,
      ownerDeck: deckCards,
      ownerTrash: [],
      revealReturns: deckCards,
      record,
    });

    await effects[0]!.resolve(ctx);

    expect(record.revealCalls).toEqual([]);
    expect(record.trashCalls.length).toBeGreaterThanOrEqual(1);
    expect(record.trashCalls[0]!.length).toBe(3);
  });

  it("[Main] calls playInstances with payCost:true for DarkKnightmon in trash", async () => {
    const source = makeSource();
    const effects = module!.effectsForTiming(EffectTiming.OnUseOption, source);

    const dkmCard = { instanceId: "dkm-inst", cardId: "BT2-DKM" };
    const record: FxRecord = {
      revealCalls: [],
      trashCalls: [],
      playInstancesCalls: [],
      returnToHandCalls: [],
      waiveColorRequirementCalls: [],
    };

    const ctx = makeContext({
      source,
      ownerTrash: [dkmCard],
      revealReturns: [],
      definitions: {
        "BT2-DKM": { cardId: "BT2-DKM", nameEn: "DarkKnightmon", kinds: [CardKind.Digimon] as never },
      },
      record,
    });

    await effects[0]!.resolve(ctx);

    const playCalls = record.playInstancesCalls.filter((c) => c.ids.includes("dkm-inst"));
    expect(playCalls.length).toBeGreaterThanOrEqual(1);
    expect(playCalls[0]!.opts.payCost).toBe(true);
  });

  it("does not treat DarkKnightmon (X Antibody) as the exact DarkKnightmon target", async () => {
    const source = makeSource();
    const effects = module!.effectsForTiming(EffectTiming.OnUseOption, source);
    const record: FxRecord = {
      revealCalls: [],
      trashCalls: [],
      playInstancesCalls: [],
      returnToHandCalls: [],
      waiveColorRequirementCalls: [],
    };
    const ctx = makeContext({
      source,
      ownerTrash: [{ instanceId: "darkknight-x", cardId: "BT10-069" }],
      definitions: {
        "BT10-069": {
          cardId: "BT10-069",
          nameEn: "DarkKnightmon (X Antibody)",
          kinds: [CardKind.Digimon] as never,
        },
      },
      record,
    });

    await effects[0]!.resolve(ctx);

    expect(record.playInstancesCalls).toHaveLength(0);
  });

  it("[Security] routes to SecuritySkill timing", () => {
    const source = makeSource();
    expect(module!.effectsForTiming(EffectTiming.SecuritySkill, source).length).toBeGreaterThanOrEqual(1);
  });

  it("[Security] calls returnToHand with the source instanceId", async () => {
    const source = makeSource({ instanceId: "immortal-ruler-inst" });
    const effects = module!.effectsForTiming(EffectTiming.SecuritySkill, source);

    const record: FxRecord = {
      revealCalls: [],
      trashCalls: [],
      playInstancesCalls: [],
      returnToHandCalls: [],
      waiveColorRequirementCalls: [],
    };
    const ctx = makeContext({
      source,
      ownerSecurity: [{ instanceId: source.instanceId, cardId: source.cardId, ownerSeat: source.ownerSeat }],
      record,
    });

    await effects[0]!.resolve(ctx);

    expect(record.returnToHandCalls.some((ids) => ids.includes("immortal-ruler-inst"))).toBe(true);
  });
});
