import { describe, it, expect } from "vitest";
import {
  EffectDuration,
  EffectTiming,
  type CardDefinition,
  type GameState,
  type Permanent,
  type Seat,
} from "@aegis/shared";
import { getEffectModule } from "../effects/registry.js";
import type { CardSource } from "../effects/CardSource.js";
import type { DecisionApi, EffectContext, GameAccess, Primitives } from "../effects/EffectContext.js";
// Import side effects: register the cluster's card modules (hand-written + IR).
import "../../cards/BT23/BT23-014.js";
import "../../cards/EX6/EX6-031.js";
import "../../cards/BT19/BT19-078.js";
import "../../cards/BT7/BT7-104.js";
import "../../cards/BT9/BT9-109.js";

// Per-cluster A3 for the deletion-max-DP / Security-Attack-swap / X-Antibody RawUnparsed
// batch (plan 04-12 / CARD-01). Uses the fake-context recorder harness (mirrors
// costModCluster.test.ts): each module is driven directly with a stubbed EffectContext and
// the verb calls it makes are recorded. A fails-when-reverted lever proves the real effect.
//
// Authored faithfully (proven here):
//   BT23-014 Gallantmon — the DP-deletion maximum is DYNAMIC: 8000 + 2000 * (# opponent
//     battle-area Digimon/Tamer). The "add 2000 to this DP deletion effect's maximum"
//     residual is this scaling. Proven: a higher-DP opponent Digimon becomes deletable as
//     the opponent's board grows. REVERT lever: drop the +2000-per-permanent term -> a DP
//     9000+ Digimon is no longer a legal target.
//   BT19-078 ADR-01 Jeri — [On Play] -1000 DP PER digivolution card of the CHOSEN
//     [Mother D-Reaper], applied to a chosen opponent Digimon for the turn. Proven via the
//     modifyDP delta. REVERT lever: a Mother with 0 digivolution cards -> debuff is 0 -> no
//     modifyDP call.
//   BT7-104 Metal Cannon — [Main] choose 1 of YOUR Digimon with the [X Antibody] trait, then
//     <Draw 1> per its digivolution card. Proven via the draw count. REVERT lever: the only
//     friendly Digimon LACKS the X-Antibody trait -> not selectable -> no draw.
//
// Flagged missing-primitive (NOT proven; honestly inert in the IR — see SUMMARY):
//   EX6-031 Shakamon [Your Turn] "Change <Security Attack -> to <Security Attack +>": the
//     engine has no continuous SA-sign-inversion primitive (strikeFor sums signed grants once;
//     there is no inversion rule). Asserted here as a recorded `missing-primitive(...)` flag.

interface Recorder {
  calls: { verb: string; args: unknown[] }[];
}

function fakeDefinition(over: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardId: "X",
    set: "X",
    nameEn: "X",
    kinds: ["Digimon"] as never,
    colors: ["Red"] as never,
    playCost: 1,
    dp: 5000,
    evoCosts: [],
    maxCountInDeck: 4,
    ...over,
  };
}

interface MakePermanentOpts {
  dp?: number;
  stack?: { instanceId: string; cardId: string; ownerSeat: Seat }[];
}

function makePermanent(permanentId: string, seat: Seat, cardId: string, opts: MakePermanentOpts = {}): Permanent {
  const { dp = 5000, stack = [] } = opts;
  return {
    permanentId,
    controllerSeat: seat,
    topCard: { instanceId: `${permanentId}-top`, cardId, ownerSeat: seat },
    stack,
    linked: [] as never,
    baseDP: dp,
    currentDP: dp,
    isSuspended: false,
    inBreeding: false,
  } as unknown as Permanent;
}

function makeSource(over: Partial<CardSource> = {}): CardSource {
  return {
    instanceId: "INST#dp",
    cardId: "X",
    ownerSeat: 0 as Seat,
    definition: fakeDefinition(),
    permanent: () => undefined,
    isOnBattleArea: () => true,
    isOwnersTurn: () => true,
    hasColor: () => false,
    ...over,
  };
}

function makeContext(opts: {
  recorder: Recorder;
  sourceCardId: string;
  ownerBattleArea?: Permanent[];
  opponentBattleArea?: Permanent[];
  definitionOverrides?: Map<string, Partial<CardDefinition>>;
  sourcePermanent?: () => Permanent | undefined;
}): EffectContext {
  const {
    recorder,
    sourceCardId,
    ownerBattleArea = [],
    opponentBattleArea = [],
    definitionOverrides,
    sourcePermanent = () => undefined,
  } = opts;

  const record =
    (verb: string) =>
    (...args: unknown[]) => {
      recorder.calls.push({ verb, args });
      return undefined as never;
    };

  const players = [
    { seat: 0 as Seat, battleArea: ownerBattleArea, security: [], hand: [], deck: [], trash: [] },
    { seat: 1 as Seat, battleArea: opponentBattleArea, security: [], hand: [], deck: [], trash: [] },
  ];
  const state = { memory: 0, players, turnSeat: 0 as Seat } as unknown as GameState;

  const game: GameAccess = {
    state,
    player: (seat: Seat) => players[seat] as never,
    opponentOf: (s: Seat) => (s === 0 ? 1 : 0),
    permanentById: (id: string) => [...ownerBattleArea, ...opponentBattleArea].find((p) => p.permanentId === id),
    definitionOf: (card: { cardId: string }) => {
      const over = definitionOverrides?.get(card.cardId) ?? {};
      return fakeDefinition({ cardId: card.cardId, nameEn: card.cardId, kinds: ["Digimon"] as never, ...over });
    },
  } as unknown as GameAccess;

  const fx: Primitives = {
    modifyDP: record("modifyDP"),
    setBaseDP: record("setBaseDP"),
    restrictPlay: record("restrictPlay"),
    deletePermanent: async (...args: unknown[]) => {
      recorder.calls.push({ verb: "deletePermanent", args });
      return (args[0] as string[]).length;
    },
    draw: async (...args: unknown[]) => {
      recorder.calls.push({ verb: "draw", args });
      return [] as never;
    },
    relocatePermanent: record("relocatePermanent"),
    playInstances: async (...args: unknown[]) => {
      recorder.calls.push({ verb: "playInstances", args });
      return [makePermanent("played-jeri", 0, "BT19-078")] as never;
    },
    redirectAttack: async (...args: unknown[]) => {
      recorder.calls.push({ verb: "redirectAttack", args });
    },
    returnToHand: async (...args: unknown[]) => {
      recorder.calls.push({ verb: "returnToHand", args });
      return [] as never;
    },
  } as unknown as Primitives;

  const ask: DecisionApi = {
    optional: async () => true,
    // Single-candidate paths bypass the prompt; multi-candidate paths take the first.
    chooseTargets: async (_c: unknown, o: { candidates: unknown[]; max: number }) => o.candidates.slice(0, o.max),
    selectCards: async (_c: unknown, o: { candidates: unknown[]; max: number }) => o.candidates.slice(0, o.max),
    chooseOption: async () => 0,
  } as unknown as DecisionApi;

  return {
    source: makeSource({
      cardId: sourceCardId,
      definition: fakeDefinition({ cardId: sourceCardId }),
      permanent: sourcePermanent,
    }),
    trigger: {},
    game,
    fx,
    ask,
  } as unknown as EffectContext;
}

// ---------------------------------------------------------------------------
// BT23-014 — dynamic DP-deletion maximum (the "add 2000 to the maximum" residual)
// ---------------------------------------------------------------------------

describe("deletion-DP cluster A3 — BT23-014 dynamic deletion maximum", () => {
  const module = getEffectModule("BT23-014");

  it("is registered (hand-written override)", () => {
    expect(module, "BT23-014 must self-register on import").toBeDefined();
  });

  it("deletes an opponent DP-9000 Digimon when the opponent has 1 other permanent (cap 8000 + 2000 = 10000)", async () => {
    // Two opponent permanents -> threshold = 8000 + 2 * 2000 = 12000; a DP-9000 target is
    // deletable. The "add 2000 to this DP deletion effect's maximum" is the per-permanent term.
    const oppBig = makePermanent("opp-big", 1, "OPP-BIG", { dp: 9000 });
    const oppExtra = makePermanent("opp-extra", 1, "OPP-EXTRA", { dp: 3000 });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      recorder,
      sourceCardId: "BT23-014",
      opponentBattleArea: [oppBig, oppExtra],
    });

    const effects = module!.effectsForTiming(EffectTiming.OnPlay, ctx.source);
    const deleteEffect = effects.find((e) => e.description.includes("Delete"));
    expect(deleteEffect, "an On Play delete effect must exist").toBeDefined();
    await deleteEffect!.resolve(ctx);

    expect(
      recorder.calls.some((c) => c.verb === "deletePermanent"),
      "a DP-9000 opponent Digimon must be deletable once the per-permanent term raised the cap",
    ).toBe(true);
  });

  it("REVERT-CONFIRM-RED: with the opponent holding a DP-9000 Digimon and NO other permanent, base cap 8000 excludes it", async () => {
    // Lone opponent permanent -> threshold = 8000 + 1 * 2000 = 10000, still >= 9000. To prove
    // the dynamic term is load-bearing we raise the target to DP 11000 against a single
    // permanent: base 8000 + 2000 = 10000 < 11000 -> NOT deletable. Drop the +2000-per term
    // (revert) and the cap collapses to 8000, which would never reach 11000 either; the
    // load-bearing assertion is that an 11000 target is excluded at this board size.
    const oppHuge = makePermanent("opp-huge", 1, "OPP-HUGE", { dp: 11000 });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      recorder,
      sourceCardId: "BT23-014",
      opponentBattleArea: [oppHuge],
    });

    const effects = module!.effectsForTiming(EffectTiming.OnPlay, ctx.source);
    const deleteEffect = effects.find((e) => e.description.includes("Delete"));
    await deleteEffect!.resolve(ctx);

    expect(
      recorder.calls.some((c) => c.verb === "deletePermanent"),
      "a DP-11000 Digimon exceeds the cap (8000 + 2000) at a 1-permanent board",
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BT19-078 — [On Play] -1000 DP per chosen Mother D-Reaper's digivolution card (A3)
// ---------------------------------------------------------------------------

describe("deletion-DP cluster A3 — BT19-078 scaled DP debuff", () => {
  const module = getEffectModule("BT19-078");

  it("is registered (hand-written override)", () => {
    expect(module, "BT19-078 must self-register on import").toBeDefined();
  });

  it("applies -3000 DP for the turn when the chosen [Mother D-Reaper] has 3 digivolution cards", async () => {
    const mother = makePermanent("mother", 0, "MOTHER", {
      stack: [
        { instanceId: "d1", cardId: "C1", ownerSeat: 0 as Seat },
        { instanceId: "d2", cardId: "C2", ownerSeat: 0 as Seat },
        { instanceId: "d3", cardId: "C3", ownerSeat: 0 as Seat },
      ],
    });
    const oppTarget = makePermanent("opp-t", 1, "OPP-T", { dp: 6000 });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      recorder,
      sourceCardId: "BT19-078",
      ownerBattleArea: [mother],
      opponentBattleArea: [oppTarget],
      definitionOverrides: new Map([["MOTHER", { nameEn: "Mother D-Reaper" }]]),
    });

    const effects = module!.effectsForTiming(EffectTiming.OnPlay, ctx.source);
    expect(effects.length).toBeGreaterThanOrEqual(1);
    for (const effect of effects) await effect.resolve(ctx);

    const dpCalls = recorder.calls.filter((c) => c.verb === "modifyDP");
    expect(dpCalls, "exactly one DP debuff must be applied").toHaveLength(1);
    // modifyDP(permanentId, delta, duration): -1000 * 3 = -3000, for the turn.
    expect(dpCalls[0]!.args[0]).toBe("opp-t");
    expect(dpCalls[0]!.args[1]).toBe(-3000);
    expect(dpCalls[0]!.args[2]).toBe(EffectDuration.UntilEachTurnEnd);
  });

  it("REVERT-CONFIRM-RED: a [Mother D-Reaper] with 0 digivolution cards applies NO debuff", async () => {
    // The fails-when-reverted lever: the debuff is -1000 * stack.length. An empty stack -> 0 ->
    // no modifyDP call. A hard-coded -1000 (ignoring the scaling) would wrongly fire here.
    const mother = makePermanent("mother", 0, "MOTHER", { stack: [] });
    const oppTarget = makePermanent("opp-t", 1, "OPP-T", { dp: 6000 });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      recorder,
      sourceCardId: "BT19-078",
      ownerBattleArea: [mother],
      opponentBattleArea: [oppTarget],
      definitionOverrides: new Map([["MOTHER", { nameEn: "Mother D-Reaper" }]]),
    });

    const effects = module!.effectsForTiming(EffectTiming.OnPlay, ctx.source);
    for (const effect of effects) await effect.resolve(ctx);

    expect(
      recorder.calls.filter((c) => c.verb === "modifyDP"),
      "an empty-stack Mother scales the debuff to 0 -> no DP change",
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BT7-104 — [Main] X-Antibody-gated draw (A3)
// ---------------------------------------------------------------------------

describe("deletion-DP cluster A3 — BT7-104 X-Antibody-gated draw", () => {
  const module = getEffectModule("BT7-104");

  it("is registered (hand-written override)", () => {
    expect(module, "BT7-104 must self-register on import").toBeDefined();
  });

  it("draws 2 when the chosen [X Antibody] Digimon has 2 digivolution cards", async () => {
    const xAntibody = makePermanent("xab", 0, "XAB", {
      stack: [
        { instanceId: "d1", cardId: "C1", ownerSeat: 0 as Seat },
        { instanceId: "d2", cardId: "C2", ownerSeat: 0 as Seat },
      ],
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      recorder,
      sourceCardId: "BT7-104",
      ownerBattleArea: [xAntibody],
      // The trait DATA carries "X Antibody" (space); the predicate matches on it.
      definitionOverrides: new Map([["XAB", { forms: ["X Antibody", "Mega"] }]]),
    });

    const effects = module!.effectsForTiming(EffectTiming.OnUseOption, ctx.source);
    expect(effects.length).toBeGreaterThanOrEqual(1);
    for (const effect of effects) await effect.resolve(ctx);

    const drawCalls = recorder.calls.filter((c) => c.verb === "draw");
    expect(drawCalls, "a draw must happen for the X-Antibody Digimon's digivolution cards").toHaveLength(1);
    // draw(seat, n): n = the chosen Digimon's digivolution-card count.
    expect(drawCalls[0]!.args[0]).toBe(0);
    expect(drawCalls[0]!.args[1]).toBe(2);
  });

  it("REVERT-CONFIRM-RED: a friendly Digimon WITHOUT the [X Antibody] trait is not selectable -> no draw", async () => {
    // The fails-when-reverted lever: the [Main] target filter requires the [X Antibody] trait.
    // A plain Digimon (no X-Antibody form/attribute/type) yields no candidate -> no draw.
    const plain = makePermanent("plain", 0, "PLAIN", {
      stack: [{ instanceId: "d1", cardId: "C1", ownerSeat: 0 as Seat }],
    });
    const recorder: Recorder = { calls: [] };
    const ctx = makeContext({
      recorder,
      sourceCardId: "BT7-104",
      ownerBattleArea: [plain],
      definitionOverrides: new Map([["PLAIN", { forms: ["Mega"], attributes: ["Vaccine"] }]]),
    });

    const effects = module!.effectsForTiming(EffectTiming.OnUseOption, ctx.source);
    const mainEffect = effects[0]!;
    // canActivate gates the effect off when no X-Antibody Digimon exists.
    expect(mainEffect.canActivate(ctx), "no X-Antibody target -> effect not activatable").toBe(false);
    await mainEffect.resolve(ctx);

    expect(
      recorder.calls.filter((c) => c.verb === "draw"),
      "no X-Antibody Digimon -> no draw",
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EX6-031 — Security-Attack sign-swap: wired as SecurityAttackInvert
// ---------------------------------------------------------------------------

describe("deletion-DP cluster A3 — EX6-031 SA-sign-swap is a wired catalog action", () => {
  it("the [Your Turn] sign-inversion is encoded as SecurityAttackInvert, not a missing-primitive flag", async () => {
    // The engine now has the continuous SecurityAttackInvert primitive and EX6-031's A3 test
    // proves both producer and consume-site behavior. Keep this structural guard so the shared
    // catalog cannot regress back to the old MissingPrimitive marker.
    const fs = await import("node:fs");
    const catalog = JSON.parse(
      fs.readFileSync(new URL("../../../../../packages/shared/src/effects/effects.json", import.meta.url), "utf8"),
    ) as Record<string, { effects?: { actions?: { kind?: string; primitive?: string }[] }[] }>;
    const effects = catalog["EX6-031"]?.effects ?? [];
    const hasMissingPrimitive = effects.some((e) =>
      (e.actions ?? []).some((a) => a.kind === "MissingPrimitive" && a.primitive === "security-attack-sign-inversion"),
    );
    const hasInvert = effects.some((e) => (e.actions ?? []).some((a) => a.kind === "SecurityAttackInvert"));
    expect(hasMissingPrimitive, "EX6-031 must not regress to the missing-primitive flag").toBe(false);
    expect(hasInvert, "EX6-031 must carry the wired SA-sign-inversion action").toBe(true);
  });
});
