import { describe, it, expect, onTestFinished } from "vitest";
import { $changes, Encoder, StateView } from "@colyseus/schema";
import { AttackTargetScope } from "@aegis/shared/effects/ir/actions/AttackTargetScope";
import {
  DNA_DIGIVOLUTION_REQUIREMENT_OVERRIDES,
  GameState,
  CardKind,
  DECK_BOTTOM,
  EffectDuration,
  EffectTiming,
  type AttackTarget,
  type Permanent,
  type Seat,
  type ServerEvent,
  PRIVATE_VIEW_TAG,
} from "@aegis/shared";
import { setBreeding } from "../state/access.js";
import { setResolvingOption } from "#api/engine/state/access";
import { MemoryGauge } from "../MemoryGauge.js";
import { ModifierLedger } from "./modifiers.js";
import { SubTriggerRegistry } from "./subtriggers.js";
import { ContinuousEffectLedger, effectiveKinds } from "./continuous.js";
import {
  createPrimitives,
  type CombatPort,
  type Primitives,
  type PrimitivesEngine,
  type SelectionPort,
} from "./primitives.js";
import { makeInstance, setupEngine, type BoardSpec, type EngineSetup, type PermanentSpec } from "../testkit/harness.js";
import { makeRng, shuffleInPlace } from "../setup.js";
import { registerCard, unregisterCard } from "./registry.js";
import type { EffectContext } from "./EffectContext.js";
import type { EffectModule } from "./EffectModule.js";

// Concrete card ids present in the generated card data (packages/shared cards.json):
const DIGIMON = "AD1-001"; // Digimon, DP 5000, playCost 5
const TAMER = "AD1-019"; // Tamer, playCost 3 (a permanent kind, DP 0)
const OPTION = "BT1-090"; // Option (NOT a permanent kind)

/** A battle-area Digimon permanent at an explicit DP, addressable by `alias`. */
function battleDigimon(alias: string, dp: number): PermanentSpec {
  return { card: DIGIMON, as: alias, dp };
}

interface Harness {
  /** The Test Seam: Board Spec aliases (`perm`/`inst`) over the laid state. */
  s: EngineSetup;
  state: GameState;
  fx: ReturnType<typeof createPrimitives>;
  events: ServerEvent[];
  ledger: ModifierLedger;
  continuous: ContinuousEffectLedger;
  subTriggers: SubTriggerRegistry;
  memory: MemoryGauge;
  selections: string[][]; // queued selectInstances responses
  selectionCandidates: string[][];
  fireTimings: { timing: EffectTiming; trigger: unknown }[];
  subTriggerFires: { event: string; payload: unknown }[];
  // permanentIds a "would leave the battle area" PREVENT reaction saves — populate to
  // simulate an active leave-prevention replacement (WR-01-style bounce/security tests).
  preventedPermanentIds: Set<string>;
  leavePreventionCalls: { permanentIds: string[]; cause: string; opts: unknown }[];
}

/**
 * The primitives under test are a subsystem, not the whole engine: they are driven through a
 * hand-built {@link PrimitivesEngine} port whose collaborators (selection, timing fires,
 * leave-prevention consult) are recording fakes the assertions read back. Only the BOARD is
 * laid through the Test Seam's Board Spec — `setupEngine` supplies the seated `GameState`
 * and the alias handles, and the port below is wired over that same state.
 */
function harness(opts?: {
  turnSeat?: Seat;
  memory?: number;
  board?: BoardSpec;
  combat?: CombatPort;
  rngForSeat?: PrimitivesEngine["rngForSeat"];
  onConsultLeave?: () => void;
  onFireSubTrigger?: PrimitivesEngine["fireSubTrigger"];
}): Harness {
  const s = setupEngine(opts?.board);
  const state = s.state;
  state.turnSeat = opts?.turnSeat ?? 0;
  state.memory = opts?.memory ?? 0;

  const events: ServerEvent[] = [];
  const ledger = new ModifierLedger();
  const continuous = new ContinuousEffectLedger();
  const subTriggers = new SubTriggerRegistry();
  const memory = new MemoryGauge(state, (e) => events.push(e));
  const selections: string[][] = [];
  const selectionCandidates: string[][] = [];
  const fireTimings: { timing: EffectTiming; trigger: unknown }[] = [];
  const subTriggerFires: { event: string; payload: unknown }[] = [];
  const preventedPermanentIds = new Set<string>();
  const leavePreventionCalls: { permanentIds: string[]; cause: string; opts: unknown }[] = [];
  let permanentSeq = 0;

  const ask: SelectionPort = {
    selectInstances: async (_seat, candidates, _min, _max) => {
      selectionCandidates.push([...candidates]);
      const next = selections.shift();
      return next ?? candidates;
    },
  };

  let instanceIdSeq = 0;
  const engine: PrimitivesEngine = {
    state,
    emit: (e) => events.push(e),
    nextPermanentId: () => `perm-${permanentSeq++}`,
    nextInstanceId: () => `tok-${instanceIdSeq++}`,
    rngForSeat: opts?.rngForSeat,
    memory,
    modifiers: ledger,
    continuous,
    subTriggers,
    combat: opts?.combat,
    ask,
    controllerSeat: () => state.turnSeat,
    fireTiming: async (timing, trigger) => {
      fireTimings.push({ timing, trigger });
    },
    fireSubTrigger: async (event, payload) => {
      subTriggerFires.push({ event, payload });
      await opts?.onFireSubTrigger?.(event, payload);
    },
    consultLeavePrevention: async (permanentIds, cause, _resolvingSeat, callOpts) => {
      leavePreventionCalls.push({ permanentIds, cause, opts: callOpts });
      opts?.onConsultLeave?.();
      return new Set(permanentIds.filter((id) => preventedPermanentIds.has(id)));
    },
    // Production (GameEngine.ts) always supplies this hook, so `createPrimitives` always
    // assigns `reactivateOnPlay`; this fake exists purely so the completeness guard below
    // exercises that fully-wired shape instead of the "hook omitted" branch other harnesses
    // never take. No test in this file calls it.
    reactivateOnPlay: async () => false,
  };

  return {
    s,
    state,
    fx: createPrimitives(engine),
    events,
    ledger,
    continuous,
    subTriggers,
    memory,
    selections,
    selectionCandidates,
    fireTimings,
    subTriggerFires,
    preventedPermanentIds,
    leavePreventionCalls,
  };
}

describe("primitives: draw", () => {
  it("moves top deck cards to hand, marks them face-up, emits cardsMoved", async () => {
    const h = harness({ board: { 0: { deck: [DIGIMON, TAMER, OPTION] } } });
    const p0 = h.state.players[0]!;

    const drawn = await h.fx.draw(0, 2);
    expect(drawn).toHaveLength(2);
    expect(p0.hand).toHaveLength(2);
    expect(p0.deck).toHaveLength(1);
    expect(p0.hand[0]!.faceUp).toBe(true);
    expect(h.events).toContainEqual(
      expect.objectContaining({ kind: "cardsMoved", from: "deck", to: "hand", seat: 0, handAddition: "draw" }),
    );
  });

  it("stops at an empty deck and returns fewer cards (deck-out is handled elsewhere)", async () => {
    const h = harness({ board: { 0: { deck: [DIGIMON] } } });
    const drawn = await h.fx.draw(0, 5);
    expect(drawn).toHaveLength(1);
    expect(h.state.players[0]!.deck).toHaveLength(0);
  });

  it("publishes the resolving effect's owner and Digimon kind with hand additions", async () => {
    const h = harness({ board: { 0: { deck: [DIGIMON] } } });

    h.fx.enterEffectResolution?.(0, [CardKind.Digimon]);
    await h.fx.draw(0, 1);
    h.fx.leaveEffectResolution?.();

    expect(h.subTriggerFires).toContainEqual({
      event: "whenEffectAddsToHand",
      payload: {
        effectAddedToHandSeat: 0,
        addedToHand: {
          instanceIds: [h.state.players[0]!.hand[0]!.instanceId],
          byEffect: { ownerSeat: 0, isDigimonEffect: true },
        },
      },
    });
  });
});

describe("primitives: memory (delegates to MemoryGauge)", () => {
  it("gainMemory moves the shared gauge in the turn player's favour", () => {
    const h = harness({ turnSeat: 0, memory: 0 });
    h.fx.gainMemory(3);
    expect(h.state.memory).toBe(3);
    expect(h.events.some((e) => e.kind === "memoryChanged" && e.to === 3)).toBe(true);
  });

  it("setMemory sets the turn player's memory absolutely", () => {
    const h = harness({ turnSeat: 0, memory: -2 });
    h.fx.setMemory(5);
    expect(h.state.memory).toBe(5);
  });
});

describe("primitives: movePermanentZone (L_breeding, P-143/P-130)", () => {
  // A battle-area permanent carrying a digivolution stack + linked card, suspended, to prove
  // the whole unit is preserved across a zone move (no trash, no stack reset).
  function suspendedStack(alias: string): PermanentSpec {
    return {
      card: DIGIMON,
      as: alias,
      dp: 5000,
      suspended: true,
      under: [{ card: DIGIMON, as: `${alias}-src` }],
      linked: [{ card: OPTION, as: `${alias}-link` }],
    };
  }

  it("toBreeding moves the whole permanent into the empty slot, preserving stack + suspension", async () => {
    const h = harness({ turnSeat: 0, board: { 0: { battleArea: [suspendedStack("p1")] } } });
    const p = h.s.perm("p1");
    const p0 = h.state.players[0]!;

    expect(await h.fx.movePermanentZone(p.permanentId, "toBreeding")).toBe(true);
    expect(p0.battleArea).toHaveLength(0);
    expect(p0.breeding).toBe(p);
    expect(p.inBreeding).toBe(true);
    // Whole unit preserved: stack + linked NOT trashed, suspension kept (Q4250/4251/4256).
    expect(p.stack).toHaveLength(1);
    expect(p.linked).toHaveLength(1);
    expect(p.isSuspended).toBe(true);
    expect(p0.trash).toHaveLength(0);
    expect(h.events.some((e) => e.kind === "cardsMoved" && e.from === "battleArea" && e.to === "breeding")).toBe(true);
    // Battle -> breeding does NOT fire OnMove (the trigger is breeding -> battle only).
    expect(h.fireTimings.some((f) => f.timing === EffectTiming.OnMove)).toBe(false);
  });

  it("toBreeding is a no-op when the breeding slot is already occupied", async () => {
    const h = harness({
      turnSeat: 0,
      board: { 0: { battleArea: [suspendedStack("occupant"), suspendedStack("p2")] } },
    });
    const occupant = h.s.perm("occupant");
    const second = h.s.perm("p2");
    await h.fx.movePermanentZone(occupant.permanentId, "toBreeding"); // fills the slot

    expect(await h.fx.movePermanentZone(second.permanentId, "toBreeding")).toBe(false);
    // p2 stays in the battle area; the slot still holds the original occupant.
    expect(h.state.players[0]!.battleArea).toContain(second);
    expect(h.state.players[0]!.breeding).toBe(occupant);
  });

  it("toBattle moves the breeding permanent to the battle area, preserving stack + suspension", async () => {
    const h = harness({ turnSeat: 0, board: { 0: { battleArea: [suspendedStack("p1")] } } });
    const p = h.s.perm("p1");
    await h.fx.movePermanentZone(p.permanentId, "toBreeding");
    h.events.length = 0;

    expect(await h.fx.movePermanentZone(p.permanentId, "toBattle")).toBe(true);
    const p0 = h.state.players[0]!;
    expect(p0.breeding).toBeUndefined();
    expect(p0.battleArea).toContain(p);
    expect(p.inBreeding).toBe(false);
    expect(p.stack).toHaveLength(1);
    expect(p.isSuspended).toBe(true);
    expect(h.events.some((e) => e.kind === "cardsMoved" && e.from === "breeding" && e.to === "battleArea")).toBe(true);
    // Breeding -> battle fires OnMove (P-130's [Your Turn] reaction) with the moved id.
    const onMove = h.fireTimings.filter((f) => f.timing === EffectTiming.OnMove);
    expect(onMove).toHaveLength(1);
    expect(onMove[0]!.trigger).toEqual({ movedPermanentId: p.permanentId });
  });

  it("toBattle is a no-op for an id not in the breeding slot", async () => {
    const h = harness({ turnSeat: 0, board: { 0: { battleArea: [suspendedStack("p1")] } } });
    // p1 stays in the battle area
    expect(await h.fx.movePermanentZone(h.s.perm("p1").permanentId, "toBattle")).toBe(false);
  });

  // WR-02: a battle -> breeding move makes the permanent inert (Comprehensive Rules §3-4-5-2:
  // a Digimon in the breeding area can't be affected by effects and its battle-area effects
  // don't run). Before the fix the move dropped only modifier + continuous and OMITTED
  // subTriggers.dropPermanent, leaving the source's replacement/watcher subscriptions live.
  // The fire seam already excludes breeding sources (permanentById scans battleArea only),
  // but the costReductionFor/replacementsFor reads filter on id alone, so a breeding source's
  // stale reduceCost would still discount while its watchers can't fire — a silent
  // inconsistency. The teardown makes the read seam agree with the fire seam.
  //
  // FAILS-WHEN-REVERTED: dropping the subTriggers teardown from the toBreeding branch leaves
  // costReductionFor returning 2 (not 0) for the now-breeding source.
  it("toBreeding drops the moved source's subTrigger replacements + watchers (WR-02)", async () => {
    const h = harness({ turnSeat: 0, board: { 0: { battleArea: [suspendedStack("p1")] } } });
    const p = h.s.perm("p1");

    h.subTriggers.subscribeReplacement({
      event: "wouldDigivolve",
      sourcePermanentId: p.permanentId,
      mode: "reduceCost",
      amount: 2,
      description: "test: stale digivolve-cost reduction from a now-breeding source",
    });
    h.subTriggers.subscribe({
      event: "onDeletionOf",
      sourcePermanentId: p.permanentId,
      once: false,
      run: async () => {},
      description: "test: stale onDeletionOf watcher from a now-breeding source",
    });
    expect(h.subTriggers.costReductionFor("wouldDigivolve", p.permanentId)).toBe(2);

    expect(await h.fx.movePermanentZone(p.permanentId, "toBreeding")).toBe(true);

    // Now inert in breeding: its replacement/watcher subscriptions are dropped so the read
    // seams agree with the fire seam (which already excludes breeding-area sources).
    expect(h.subTriggers.costReductionFor("wouldDigivolve", p.permanentId)).toBe(0);
    expect(h.subTriggers.subscriptionsFor("onDeletionOf", p.permanentId)).toHaveLength(0);
  });
});

describe("primitives: modifyDP (BT15-002 style)", () => {
  it("buffs a permanent's currentDP for a duration and the sweep restores it", () => {
    const h = harness({ turnSeat: 0, board: { 0: { battleArea: [battleDigimon("p1", 5000)] } } });
    const permanent = h.s.perm("p1");
    h.fx.modifyDP(permanent.permanentId, 1000, EffectDuration.UntilOpponentTurnEnd);
    expect(permanent.currentDP).toBe(6000);
    // Opponent (seat 1) turn ends -> seat-0 owner's UntilOpponentTurnEnd modifier clears.
    h.ledger.sweep(h.state, "ownerTurnEnd", 1);
    expect(permanent.currentDP).toBe(5000);
  });

  it("is a no-op for an unknown permanent id", () => {
    const h = harness();
    expect(() => h.fx.modifyDP("ghost", 1000, EffectDuration.UntilEndBattle)).not.toThrow();
  });

  it("frames opponent-targeted durations from the resolving effect controller", () => {
    const h = harness({
      turnSeat: 0,
      board: { 1: { battleArea: [battleDigimon("target", 5000)] } },
    });
    const target = h.s.perm("target");

    h.fx.enterEffectResolution?.(0);
    h.fx.modifyDP(target.permanentId, -2000, EffectDuration.UntilOpponentTurnEnd);
    h.fx.restrict(target.permanentId, "unsuspend", EffectDuration.UntilOpponentTurnEnd);
    h.fx.grantKeyword(target.permanentId, "Blocker", EffectDuration.UntilOpponentTurnEnd);
    h.fx.leaveEffectResolution?.();

    h.ledger.sweep(h.state, "ownerTurnEnd", 0);
    h.continuous.sweep(h.state, "ownerTurnEnd", 0);
    expect(target.currentDP).toBe(3000);
    expect(h.continuous.hasRestriction(target.permanentId, "unsuspend")).toBe(true);
    expect(h.continuous.hasKeyword(target.permanentId, "Blocker")).toBe(true);

    h.ledger.sweep(h.state, "ownerTurnEnd", 1);
    h.continuous.sweep(h.state, "ownerTurnEnd", 1);
    expect(target.currentDP).toBe(5000);
    expect(h.continuous.hasRestriction(target.permanentId, "unsuspend")).toBe(false);
    expect(h.continuous.hasKeyword(target.permanentId, "Blocker")).toBe(false);
  });

  it("enforces can't unsuspend against effect-driven unsuspension", async () => {
    const h = harness({
      turnSeat: 0,
      board: { 1: { battleArea: [battleDigimon("frozen", 5000)] } },
    });
    const target = h.s.perm("frozen");
    target.isSuspended = true;

    h.fx.enterEffectResolution?.(0);
    h.fx.restrict(target.permanentId, "unsuspend", EffectDuration.UntilOpponentTurnEnd);
    h.fx.leaveEffectResolution?.();
    await h.fx.unsuspend([target.permanentId]);

    expect(target.isSuspended).toBe(true);
  });
});

describe("primitives: playFromHand / playFromSecurity (BT7-089 style)", () => {
  it("plays a Digimon from hand as a new permanent with DP from its definition", async () => {
    const h = harness({ board: { 0: { hand: [{ card: DIGIMON, as: "c" }] } } });

    const created = await h.fx.playFromHand([h.s.inst("c").instanceId]);
    expect(created).toHaveLength(1);
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(h.state.players[0]!.hand).toHaveLength(0);
    expect(created[0]!.baseDP).toBe(5000);
    expect(created[0]!.currentDP).toBe(5000);
    expect(h.events.some((e) => e.kind === "cardPlayed")).toBe(true);
  });

  it.each([
    [-3000, 2000],
    [3000, 8000],
  ])("applies an already-active player-wide DP modifier (%i) to a newly played permanent", async (delta, expected) => {
    const h = harness({ board: { 0: { hand: [{ card: DIGIMON, as: "entrant" }] } } });
    h.ledger.addPlayerDpModifier(h.state, 0, delta, EffectDuration.UntilEachTurnEnd);

    const created = await h.fx.playFromHand([h.s.inst("entrant").instanceId]);

    expect(created[0]!.currentDP).toBe(expected);
  });

  it("does not play an Option as a permanent (not a permanent kind)", async () => {
    const h = harness({ board: { 0: { hand: [{ card: OPTION, as: "c" }] } } });
    const created = await h.fx.playFromHand([h.s.inst("c").instanceId]);
    expect(created).toHaveLength(0);
    expect(h.state.players[0]!.hand).toHaveLength(1); // untouched
  });

  it("pays the play cost when payCost is set and there is enough memory", async () => {
    // can afford cost 5
    const h = harness({ turnSeat: 0, memory: 10, board: { 0: { hand: [{ card: DIGIMON, as: "c" }] } } });
    await h.fx.playFromHand([h.s.inst("c").instanceId], { payCost: true });
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(h.state.memory).toBe(5); // 10 - 5
  });

  it("stacks an effect-provided reduction with active play-cost modifiers", async () => {
    const h = harness({ turnSeat: 0, memory: 10, board: { 0: { hand: [{ card: DIGIMON, as: "c" }] } } });
    h.ledger.addPlayCostAdjustment(
      ({ def, controllerSeat }) => def.cardId === DIGIMON && controllerSeat === 0,
      -2,
      false,
    );

    await h.fx.playFromHand([h.s.inst("c").instanceId], { payCost: true, costDelta: 1 });

    // Printed 5 - active 2 - the resolving effect's 1 = 2.
    expect(h.state.memory).toBe(8);
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("skips an unaffordable payCost play (no partial pay, card stays in hand)", async () => {
    // cannot afford anything
    const h = harness({ turnSeat: 0, memory: -10, board: { 0: { hand: [{ card: DIGIMON, as: "c" }] } } });
    const created = await h.fx.playFromHand([h.s.inst("c").instanceId], { payCost: true });
    expect(created).toHaveLength(0);
    expect(h.state.players[0]!.hand).toHaveLength(1);
  });

  it("plays a card from security for free (playFromSecurity)", async () => {
    const h = harness({ board: { 0: { security: [{ card: TAMER, as: "c" }] } } });
    const permanent = await h.fx.playFromSecurity(h.s.inst("c").instanceId);
    expect(permanent).toBeDefined();
    expect(h.state.players[0]!.security).toHaveLength(0);
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(permanent!.topCard.faceUp).toBe(true);
  });

  it("applies a negative player-wide DP modifier to a security-played entrant", async () => {
    const h = harness({ board: { 0: { security: [{ card: DIGIMON, as: "security-entrant" }] } } });
    h.ledger.addPlayerDpModifier(h.state, 0, -3000, EffectDuration.UntilEachTurnEnd);

    const permanent = await h.fx.playFromSecurity(h.s.inst("security-entrant").instanceId);

    expect(permanent?.currentDP).toBe(2000);
  });

  it("restores a fresh entrant to printed DP when the player-wide duration expires", async () => {
    const h = harness({
      board: {
        0: {
          hand: [
            { card: DIGIMON, as: "expiring-entrant" },
            { card: DIGIMON, as: "after-expiry" },
          ],
        },
      },
    });
    h.ledger.addPlayerDpModifier(h.state, 0, -3000, EffectDuration.UntilEachTurnEnd);
    const permanent = (await h.fx.playFromHand([h.s.inst("expiring-entrant").instanceId]))[0]!;

    expect(permanent.currentDP).toBe(2000);
    h.ledger.sweep(h.state, "eachTurnEnd", 0);
    expect(permanent.currentDP).toBe(5000);

    const afterExpiry = (await h.fx.playFromHand([h.s.inst("after-expiry").instanceId]))[0]!;
    expect(afterExpiry.currentDP).toBe(5000);
  });
});

describe("primitives: placeOptionAsPermanent (EX3-036 option-permanent placement)", () => {
  it("places an Option from hand as a 0-DP battle-area permanent", async () => {
    const h = harness({ board: { 0: { hand: [{ card: OPTION, as: "c" }] } } });

    const permanent = await h.fx.placeOptionAsPermanent!(h.s.inst("c").instanceId);
    expect(permanent, "an Option-permanent must be created").toBeDefined();
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(h.state.players[0]!.hand).toHaveLength(0);
    expect(permanent!.baseDP).toBe(0); // Option is not a Digimon -> 0 DP
    expect(permanent!.topCard.faceUp).toBe(true);
    expect(h.events.some((e) => e.kind === "cardPlayed")).toBe(true);
  });

  it("fires whenOptionPlayed after placing the Option permanent (BT13-007 seam)", async () => {
    const h = harness({ board: { 0: { hand: [{ card: "BT13-110", as: "c" }] } } });

    const permanent = await h.fx.placeOptionAsPermanent!(h.s.inst("c").instanceId);

    expect(permanent).toBeDefined();
    expect(h.subTriggerFires).toEqual([
      { event: "whenOptionPlayed", payload: { subjectPermanentId: permanent!.permanentId } },
    ]);
  });

  it("REVERT-CONFIRM-RED: refuses a non-Option (Digimon) card -> no placement, card stays in hand", async () => {
    // The gate: the option-permanent path is strictly for Option cards (it must not broaden the
    // normal permanent kinds). A Digimon is a no-op here (it is played via playFromHand instead).
    const h = harness({ board: { 0: { hand: [{ card: DIGIMON, as: "c" }] } } });

    const permanent = await h.fx.placeOptionAsPermanent!(h.s.inst("c").instanceId);
    expect(permanent, "a non-Option must NOT be placed by the option-permanent path").toBeUndefined();
    expect(h.state.players[0]!.battleArea).toHaveLength(0);
    expect(h.state.players[0]!.hand).toHaveLength(1); // untouched
    expect(h.subTriggerFires).toHaveLength(0);
  });
});

describe("primitives: playToken (PlayToken IR kind)", () => {
  it("creates a named token as a new battle-area permanent for the seat", async () => {
    const h = harness();
    // "Diaboromon Token" resolves via the shared token registry (packages/shared tokens.ts).
    const permanent = await h.fx.playToken(0, "Diaboromon Token", { payCost: false });
    expect(permanent, "a token permanent must be created").toBeDefined();
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(permanent!.topCard.faceUp).toBe(true);
    expect(h.events.some((e) => e.kind === "cardsMoved" && e.to === "battleArea")).toBe(true);
  });

  it("blocks token creation before placement or play watchers (Discord 1556299783898005544)", async () => {
    const h = harness();
    h.continuous.addPlayProhibition(1, 0, { kinds: ["Digimon"] }, "play", EffectDuration.UntilOpponentTurnEnd, {
      byEffectOnly: true,
    });
    expect(await h.fx.playToken(1, "AthoRenePor Token", { payCost: false })).toBeUndefined();
    expect(h.state.players[1]!.battleArea).toHaveLength(0);
    expect(h.events).toHaveLength(0);
    expect(h.fireTimings).toHaveLength(0);
    expect(h.subTriggerFires).toHaveLength(0);
    expect(await h.fx.playToken(0, "AthoRenePor Token", { payCost: false })).toBeDefined();
  });

  it("preserves descriptor keyword metadata on Atho, René & Por", async () => {
    const h = harness();
    const permanent = await h.fx.playToken(0, "AthoRenePor Token", {
      payCost: false,
      keywords: [{ keyword: "Reboot" }, { keyword: "Blocker" }, { keyword: "Decoy", specifiers: ["Red", "Black"] }],
    });
    expect(permanent).toBeDefined();
    expect(h.continuous.grantedKeywords(permanent!.permanentId)).toEqual([
      { keyword: "Reboot", amount: undefined },
      { keyword: "Blocker", amount: undefined },
      { keyword: "Decoy", amount: undefined },
    ]);
    expect(h.continuous.keywordSpecifiers(permanent!.permanentId, "Decoy")).toEqual(["Red", "Black"]);
  });

  it("REVERT-CONFIRM-RED: an unknown token name creates nothing", async () => {
    // The token is resolved by name; an unresolvable name yields no permanent (the fails-when-
    // reverted lever: stubbing the playToken dispatch likewise produces no token).
    const h = harness();
    const permanent = await h.fx.playToken(0, "Not A Real Token", { payCost: false });
    expect(permanent).toBeUndefined();
    expect(h.state.players[0]!.battleArea).toHaveLength(0);
  });
});

describe("primitives: forceBattle (Battle may-battle, §14 DP comparison)", () => {
  it("deletes the lower-DP Digimon in a direct battle (KB Q6278 standard-rules battle)", async () => {
    const h = harness({
      board: {
        0: { battleArea: [battleDigimon("atk", 7000)] },
        1: { battleArea: [battleDigimon("def", 3000)] },
      },
    });
    const attackerId = h.s.perm("atk").permanentId;
    const defenderId = h.s.perm("def").permanentId;

    await h.fx.forceBattle!(attackerId, defenderId);

    // Attacker (7000) beats defender (3000): the defender is deleted, the attacker survives.
    expect(
      h.state.players[1]!.battleArea.some((p) => p.permanentId === defenderId),
      "lower-DP defender deleted",
    ).toBe(false);
    expect(
      h.state.players[0]!.battleArea.some((p) => p.permanentId === attackerId),
      "higher-DP attacker survives",
    ).toBe(true);
    expect(h.events.find((e) => e.kind === "combatResolved")).toMatchObject({ seat: 0 });
  });

  it("REVERT-CONFIRM-RED: the lower-DP attacker is the one deleted (outcome follows DP, not role)", async () => {
    // The §14 comparison is symmetric: a 3000 attacker into a 7000 defender deletes the ATTACKER.
    // This proves the deletion follows the DP comparison (a stubbed no-op forceBattle deletes
    // neither -> RED on the "attacker deleted" assertion).
    const h = harness({
      board: {
        0: { battleArea: [battleDigimon("weak-atk", 3000)] },
        1: { battleArea: [battleDigimon("strong-def", 7000)] },
      },
    });
    const attackerId = h.s.perm("weak-atk").permanentId;
    const defenderId = h.s.perm("strong-def").permanentId;

    await h.fx.forceBattle!(attackerId, defenderId);

    expect(
      h.state.players[0]!.battleArea.some((p) => p.permanentId === attackerId),
      "lower-DP attacker deleted",
    ).toBe(false);
    expect(
      h.state.players[1]!.battleArea.some((p) => p.permanentId === defenderId),
      "higher-DP defender survives",
    ).toBe(true);
  });
});

describe("primitives: trash / delete / suspend", () => {
  it("trashes loose cards from hand to their owner's trash", async () => {
    const h = harness({
      board: {
        0: {
          hand: [
            { card: OPTION, as: "a" },
            { card: TAMER, as: "b" },
          ],
        },
      },
    });
    const moved = await h.fx.trash([h.s.inst("a").instanceId, h.s.inst("b").instanceId]);
    expect(moved).toHaveLength(2);
    expect(h.state.players[0]!.trash).toHaveLength(2);
    expect(h.state.players[0]!.hand).toHaveLength(0);
  });

  it("publishes hand origins and public identities grouped by seat while preserving other zones", async () => {
    const h = harness({
      board: {
        0: {
          hand: [{ card: OPTION, as: "ownHand", artId: "alternate-option-art", faceUp: false }],
          deck: [{ card: DIGIMON, as: "deckCard" }],
          trash: [{ card: TAMER, as: "alreadyTrashed" }],
        },
        1: {
          hand: [
            { card: TAMER, as: "opponentFirst", faceUp: false },
            { card: OPTION, as: "opponentSecond", faceUp: false },
          ],
        },
      },
    });
    const names = ["ownHand", "deckCard", "opponentFirst", "opponentSecond", "alreadyTrashed"];
    const moved = await h.fx.trash([...names.map((name) => h.s.inst(name).instanceId), "missing-card"]);
    expect(h.events.filter(({ kind }) => kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        instanceIds: [h.s.inst("ownHand").instanceId],
        cardIds: [OPTION],
        artIds: ["alternate-option-art"],
        seat: 0,
        from: "hand",
        fromSeat: 0,
        to: "trash",
      },
      {
        kind: "cardsMoved",
        instanceIds: [h.s.inst("deckCard").instanceId],
        cardIds: [DIGIMON],
        artIds: [DIGIMON],
        from: "deck",
        fromSeat: 0,
        seat: 0,
        to: "trash",
      },
      {
        kind: "cardsMoved",
        instanceIds: [h.s.inst("opponentFirst").instanceId, h.s.inst("opponentSecond").instanceId],
        cardIds: [TAMER, OPTION],
        artIds: [TAMER, OPTION],
        seat: 1,
        fromSeat: 1,
        from: "hand",
        to: "trash",
      },
    ]);
    expect(moved).toHaveLength(4);
    expect(moved.every((card) => card.faceUp)).toBe(true);
    expect(h.state.players[0]!.hand).toHaveLength(0);
    expect(h.state.players[1]!.hand).toHaveLength(0);
    expect(h.state.players[0]!.trash).toHaveLength(3);
    expect(h.state.players[1]!.trash).toHaveLength(2);
    expect(h.subTriggerFires.filter(({ event }) => event === "whenHandTrashed")).toHaveLength(2);
  });

  it("does not publish hand movement for a card already trashed or a missing instance", async () => {
    const h = harness({ board: { 0: { trash: [{ card: OPTION, as: "alreadyTrashed" }] } } });
    expect(await h.fx.trash([h.s.inst("alreadyTrashed").instanceId, "missing-card"])).toEqual([]);
    expect(h.events.filter(({ kind }) => kind === "cardsMoved")).toEqual([]);
  });

  it("attributes hand-trash triggers to the effect controller", async () => {
    const h = harness({
      board: { 0: { hand: [{ card: OPTION, as: "discarded" }] } },
    });

    await h.fx.trash([h.s.inst("discarded").instanceId], { byEffectSeat: 1 });

    expect(h.subTriggerFires).toContainEqual(
      expect.objectContaining({
        event: "whenHandTrashed",
        payload: expect.objectContaining({ handTrashedSeat: 0, byEffectSeat: 1 }),
      }),
    );
    expect(h.subTriggerFires).toContainEqual({
      event: "whenTrashedFromHand",
      payload: {
        handTrashedSeat: 0,
        handTrashedInstanceIds: [h.s.inst("discarded").instanceId],
        trashedFromHandCardId: OPTION,
        trashedFromHandInstanceId: h.s.inst("discarded").instanceId,
        byEffectSeat: 1,
      },
    });
  });

  it("trashFromSecurity removes from the bottom by default and the top with fromTop", async () => {
    // index 0 = top
    const h = harness({
      board: {
        1: {
          security: [
            { card: OPTION, as: "top" },
            { card: TAMER, as: "bottom" },
          ],
        },
      },
    });
    const topId = h.s.inst("top").instanceId;
    const bottomId = h.s.inst("bottom").instanceId;

    const fromBottom = await h.fx.trashFromSecurity(1, 1);
    expect(fromBottom[0]!.instanceId).toBe(bottomId);

    const fromTop = await h.fx.trashFromSecurity(1, 1, { fromTop: true });
    expect(fromTop[0]!.instanceId).toBe(topId);
    expect(h.state.players[1]!.security).toHaveLength(0);
  });

  it("trashFromSecurity names the trashed cards and their seat on the movement event", async () => {
    const h = harness({
      board: {
        1: {
          security: [
            { card: OPTION, as: "top" },
            { card: TAMER, as: "bottom" },
          ],
        },
      },
    });
    const topId = h.s.inst("top").instanceId;
    const bottomId = h.s.inst("bottom").instanceId;

    await h.fx.trashFromSecurity(1, 2, { fromTop: true });

    // The event is broadcast before the state patch that lands the cards in the trash,
    // so it must carry the now-public identities itself for the client's trash scene.
    expect(h.events).toContainEqual({
      kind: "cardsMoved",
      instanceIds: [topId, bottomId],
      from: "security",
      to: "trash",
      cardIds: [OPTION, TAMER],
      artIds: [OPTION, TAMER],
      seat: 1,
    });
  });

  it("trashFromSecurity removes an explicitly selected card from anywhere in security", async () => {
    const h = harness({
      board: {
        1: {
          security: [
            { card: OPTION, as: "top" },
            { card: TAMER, as: "chosen" },
            { card: DIGIMON, as: "bottom" },
          ],
        },
      },
    });
    const chosenId = h.s.inst("chosen").instanceId;

    const moved = await h.fx.trashFromSecurity(1, 1, { instanceIds: [chosenId] });

    expect(moved.map((card) => card.instanceId)).toEqual([chosenId]);
    expect(h.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      h.s.inst("top").instanceId,
      h.s.inst("bottom").instanceId,
    ]);
  });

  it("securityToHand publishes effect-driven security-removal events after the move", async () => {
    const h = harness({
      board: { 0: { security: [{ card: OPTION, as: "securityCard" }] } },
    });
    const instanceId = h.s.inst("securityCard").instanceId;

    const moved = await h.fx.securityToHand(0, 1);
    expect(h.events).toContainEqual(
      expect.objectContaining({ kind: "cardsMoved", from: "security", to: "hand", seat: 0, handAddition: "transfer" }),
    );

    expect(moved.map((card) => card.instanceId)).toEqual([instanceId]);
    expect(h.state.players[0]!.security).toHaveLength(0);
    expect(h.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([instanceId]);
    expect(h.subTriggerFires).toContainEqual({
      event: "whenEffectRemovesFromSecurity",
      payload: { removedFromSecuritySeat: 0 },
    });
    expect(h.subTriggerFires).toContainEqual({
      event: "whenSecurityRemoved",
      payload: { removedFromSecuritySeat: 0, securityRemovedByEffect: true },
    });
  });

  it("Feedback #47: security deck returns notify each removed owner once for a committed batch", async () => {
    const h = harness({
      board: {
        0: {
          security: [
            { card: OPTION, as: "first" },
            { card: OPTION, as: "second" },
          ],
        },
        1: { security: [{ card: OPTION, as: "opponent" }] },
      },
    });
    const ids = ["first", "second", "opponent"].map((alias) => h.s.inst(alias).instanceId);
    const moved = await h.fx.returnToDeck([...ids, ids[0]!], { toTop: false });
    expect(moved.map((card) => card.instanceId)).toEqual(ids);
    expect(h.subTriggerFires.filter(({ event }) => event === "whenSecurityRemoved")).toEqual([
      { event: "whenSecurityRemoved", payload: { removedFromSecuritySeat: 0, securityRemovedByEffect: true } },
      { event: "whenSecurityRemoved", payload: { removedFromSecuritySeat: 1, securityRemovedByEffect: true } },
    ]);
    expect(h.subTriggerFires.filter(({ event }) => event === "whenEffectRemovesFromSecurity")).toEqual([
      { event: "whenEffectRemovesFromSecurity", payload: { removedFromSecuritySeat: 0 } },
      { event: "whenEffectRemovesFromSecurity", payload: { removedFromSecuritySeat: 1 } },
    ]);
    expect(h.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(ids.slice(0, 2));
    expect(h.state.players[1]!.deck.map((card) => card.instanceId)).toEqual(ids.slice(2));
    expect(
      h.subTriggerFires.some(
        ({ event }) => event === "whenCardTrashedFromSecurity" || event === "whenEffectTrashesFromSecurity",
      ),
    ).toBe(false);
    expect(h.subTriggerFires.findIndex(({ event }) => event === "whenSecurityRemoved")).toBeLessThan(
      h.subTriggerFires.findIndex(({ event }) => event === "whenEffectAddsToDeck"),
    );
  });

  it("Feedback #47: a return with no moved security card creates no removal signal", async () => {
    const h = harness({ board: { 0: { security: [{ card: OPTION, as: "kept" }] } } });
    expect(await h.fx.returnToDeck(["absent-instance"], { toTop: false })).toEqual([]);
    expect(h.state.players[0]!.security.map((card) => card.instanceId)).toEqual([h.s.inst("kept").instanceId]);
    expect(h.subTriggerFires).toEqual([]);
  });

  it("deletePermanent sends the whole permanent to trash and drops its modifiers", async () => {
    const h = harness({
      board: {
        0: { battleArea: [{ card: DIGIMON, as: "p1", dp: 5000, under: [{ card: TAMER, as: "evo" }] }] },
      },
    });
    const permanent = h.s.perm("p1");
    const evoId = h.s.inst("evo").instanceId;
    h.fx.modifyDP(permanent.permanentId, 1000, EffectDuration.UntilEndBattle);
    expect(permanent.currentDP).toBe(6000);

    await h.fx.deletePermanent([permanent.permanentId]);
    expect(h.state.players[0]!.battleArea).toHaveLength(0);
    // top + stacked evo both to trash
    expect(h.state.players[0]!.trash.map((c) => c.instanceId).sort()).toEqual(
      [permanent.topCard.instanceId, evoId].sort(),
    );
    expect(h.ledger.dpDeltaOf(permanent.permanentId)).toBe(0);
  });

  it("deletePermanent narrates the move to trash exactly once for the whole batch", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            { card: DIGIMON, as: "p1", dp: 5000, under: [{ card: TAMER, as: "evo" }] },
            battleDigimon("p2", 4000),
          ],
        },
      },
    });
    const first = h.s.perm("p1");
    const second = h.s.perm("p2");

    await h.fx.deletePermanent([first.permanentId, second.permanentId]);

    expect(h.events.filter(({ kind }) => kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        instanceIds: [h.s.inst("evo").instanceId, first.topCard.instanceId, second.topCard.instanceId],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [first, second].map((permanent) => ({
          permanentId: permanent.permanentId,
          instanceId: permanent.topCard.instanceId,
          cardId: permanent.topCard.cardId,
          seat: permanent.controllerSeat,
        })),
      },
    ]);
  });

  it("deletePermanent narrates a breeding deletion from the breeding area", async () => {
    const h = harness({ board: { 0: { breeding: { card: DIGIMON, as: "hatched" } } } });

    await h.fx.deletePermanent([h.s.perm("hatched").permanentId]);

    expect(h.events.filter(({ kind }) => kind === "cardsMoved")).toEqual([
      expect.objectContaining({ from: "breeding", to: "trash" }),
    ]);
  });

  it("applies source-kind-qualified beAffected restrictions to hand-written mutations", async () => {
    const digimonSource = harness({
      board: { 0: { battleArea: [battleDigimon("target", 5000)] } },
    });
    const digimonTargetId = digimonSource.s.perm("target").permanentId;
    digimonSource.continuous.addRestriction(digimonTargetId, "beAffected", EffectDuration.UntilOpponentTurnEnd, {
      fromSourceKind: ["Digimon"],
      byOpponentEffectsOnly: true,
    });

    digimonSource.fx.enterEffectResolution?.(1, ["Digimon"]);
    expect(await digimonSource.fx.deletePermanent([digimonTargetId], "byEffect")).toBe(0);
    digimonSource.fx.leaveEffectResolution?.();
    expect(digimonSource.state.players[0]!.battleArea).toHaveLength(1);

    const optionSource = harness({
      board: { 0: { battleArea: [battleDigimon("target", 5000)] } },
    });
    const optionTargetId = optionSource.s.perm("target").permanentId;
    optionSource.continuous.addRestriction(optionTargetId, "beAffected", EffectDuration.UntilOpponentTurnEnd, {
      fromSourceKind: ["Digimon"],
      byOpponentEffectsOnly: true,
    });

    optionSource.fx.enterEffectResolution?.(1, ["Option"]);
    expect(await optionSource.fx.deletePermanent([optionTargetId], "byEffect")).toBe(1);
    optionSource.fx.leaveEffectResolution?.();
    expect(optionSource.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("suspend / unsuspend flips the permanent flag", () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("p1", 5000)] } } });
    const id = h.s.perm("p1").permanentId;
    h.fx.suspend([id]);
    expect(h.state.players[0]!.battleArea[0]!.isSuspended).toBe(true);
    h.fx.unsuspend([id]);
    expect(h.state.players[0]!.battleArea[0]!.isSuspended).toBe(false);
  });
});

describe("primitives: return to hand / deck", () => {
  it("returnToHand returns the top card and trashes its digivolution cards", async () => {
    const h = harness({
      board: {
        0: { battleArea: [{ card: DIGIMON, as: "p1", dp: 5000, under: [{ card: TAMER, as: "evo" }] }] },
      },
    });

    const permanentId = h.s.perm("p1").permanentId;
    const moved = await h.fx.returnToHand([h.s.perm("p1").topCard.instanceId]);
    expect(moved).toHaveLength(1);
    expect(h.state.players[0]!.battleArea).toHaveLength(0);
    expect(h.state.players[0]!.hand.map((card) => card.cardId)).toEqual([DIGIMON]);
    expect(h.state.players[0]!.trash.map((card) => card.cardId)).toEqual([TAMER]);
    expect(h.events).toContainEqual({
      kind: "cardsMoved",
      instanceIds: moved.map((card) => card.instanceId),
      from: "battleArea",
      fromSeat: 0,
      to: "hand",
      seat: 0,
      handAddition: "transfer",
      returnedPermanents: [{ permanentId, instanceId: moved[0]!.instanceId, cardId: DIGIMON, seat: 0 }],
    });
  });

  it("preserves the real deck origin of revealed cards returned to hand", async () => {
    const h = harness({ board: { 0: { deck: [{ card: DIGIMON, as: "revealed" }] } } });
    await h.fx.reveal(0, 1);
    const id = h.s.inst("revealed").instanceId;
    await h.fx.returnToHand([id], { publicIdentities: true });
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        from: "deck",
        fromSeat: 0,
        to: "hand",
        seat: 0,
        handAddition: "transfer",
        instanceIds: [id],
        cardIds: [DIGIMON],
      },
    ]);
  });

  it("keeps mixed-owner, mixed-origin private additions ordered and unnamed", async () => {
    const h = harness({
      board: {
        0: {
          deck: [
            { card: DIGIMON, as: "first" },
            { card: TAMER, as: "third" },
          ],
        },
        1: { trash: [{ card: OPTION, as: "second" }] },
      },
    });
    const ids = ["first", "second", "third"].map((alias) => h.s.inst(alias).instanceId);
    await h.fx.returnToHand(ids);
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        from: "deck",
        fromSeat: 0,
        to: "hand",
        seat: 0,
        handAddition: "transfer",
        instanceIds: [ids[0]],
      },
      {
        kind: "cardsMoved",
        from: "trash",
        fromSeat: 1,
        to: "hand",
        seat: 1,
        handAddition: "transfer",
        instanceIds: [ids[1]],
      },
      {
        kind: "cardsMoved",
        from: "deck",
        fromSeat: 0,
        to: "hand",
        seat: 0,
        handAddition: "transfer",
        instanceIds: [ids[2]],
      },
    ]);
  });

  it("labels a silent hand bridge as staging without exposing identities or firing hand-addition triggers", async () => {
    const h = harness({ board: { 1: { deck: [{ card: DIGIMON, as: "staged" }] } } });
    const id = h.s.inst("staged").instanceId;
    await h.fx.returnToHand([id], { silent: true });
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        from: "deck",
        fromSeat: 1,
        to: "hand",
        seat: 1,
        handAddition: "staging",
        instanceIds: [id],
      },
    ]);
    expect(h.subTriggerFires.some((entry) => entry.event === "whenEffectAddsToHand")).toBe(false);
  });

  it("returnToDeck places a loose card on top or bottom, face-down", async () => {
    const h = harness({
      board: { 0: { deck: [DIGIMON], hand: [{ card: TAMER, as: "c" }] } },
    });
    const cId = h.s.inst("c").instanceId;

    await h.fx.returnToDeck([cId], { toTop: true });
    expect(h.state.players[0]!.deck[0]!.instanceId).toBe(cId);
    expect(h.state.players[0]!.deck[0]!.faceUp).toBe(false);
    expect(h.state.players[0]!.hand).toHaveLength(0);
  });

  it("returnToDeck atomically reorders cards already in that deck", async () => {
    const h = harness({
      board: {
        0: {
          deck: [
            { card: DIGIMON, as: "first" },
            { card: TAMER, as: "second" },
            { card: OPTION, as: "untouched" },
          ],
        },
      },
    });
    const requestedOrder = [h.s.inst("second").instanceId, h.s.inst("first").instanceId];

    await h.fx.returnToDeck(requestedOrder, { toTop: false });

    expect(h.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      h.s.inst("untouched").instanceId,
      ...requestedOrder,
    ]);
    expect(h.state.players[0]!.hand).toHaveLength(0);
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      expect.objectContaining({ instanceIds: requestedOrder, to: DECK_BOTTOM }),
    ]);
  });

  it("returnToDeck names each deck joined and the public cards that joined it", async () => {
    const h = harness({
      board: {
        0: {
          trash: [
            { card: DIGIMON, as: "mineOne" },
            { card: TAMER, as: "mineTwo" },
          ],
        },
        1: { trash: [{ card: OPTION, as: "theirs" }] },
      },
    });
    const returned = ["mineOne", "theirs", "mineTwo"].map((name) => h.s.inst(name).instanceId);

    await h.fx.returnToDeck(returned, { toTop: false });

    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        instanceIds: [returned[0]],
        from: "trash",
        fromSeat: 0,
        to: DECK_BOTTOM,
        deckReturnOrder: true,
        seat: 0,
        cardIds: [DIGIMON],
      },
      {
        kind: "cardsMoved",
        instanceIds: [returned[1]],
        from: "trash",
        fromSeat: 1,
        to: DECK_BOTTOM,
        deckReturnOrder: true,
        seat: 1,
        cardIds: [OPTION],
      },
      {
        kind: "cardsMoved",
        instanceIds: [returned[2]],
        from: "trash",
        fromSeat: 0,
        to: DECK_BOTTOM,
        deckReturnOrder: true,
        seat: 0,
        cardIds: [TAMER],
      },
    ]);
  });

  it("returnToDeck keeps a hand card unnamed on its way to the deck", async () => {
    const h = harness({ board: { 0: { hand: [{ card: DIGIMON, as: "hidden" }] } } });

    await h.fx.returnToDeck([h.s.inst("hidden").instanceId], { toTop: false });

    const [moved] = h.events.filter((event) => event.kind === "cardsMoved");
    expect(moved).toMatchObject({ to: DECK_BOTTOM, seat: 0 });
    expect(moved).not.toHaveProperty("cardIds");
  });

  it("returnToDeck routes a Digi-Egg card back to the Digi-Egg deck", async () => {
    const h = harness({
      board: {
        0: {
          deck: [DIGIMON],
          trash: [{ card: "BT1-001", as: "egg" }],
        },
      },
    });

    await h.fx.returnToDeck([h.s.inst("egg").instanceId], { toTop: false });

    expect(h.state.players[0]!.deck.map((card) => card.cardId)).toEqual([DIGIMON]);
    expect(h.state.players[0]!.eggDeck.map((card) => card.cardId)).toEqual(["BT1-001"]);
    expect(h.state.players[0]!.trash).toHaveLength(0);
  });

  it("returnStackTopsToDeck returns the current top first, promotes the remaining source, and fires one deck-add event", async () => {
    const h = harness({
      turnSeat: 1,
      board: {
        0: {
          battleArea: [
            {
              card: DIGIMON,
              as: "host",
              under: [
                { card: "BT1-009", as: "bottom" },
                { card: "BT1-010", as: "upper" },
              ],
            },
          ],
        },
      },
    });
    const originalTop = h.s.perm("host").topCard;

    const moved = await h.fx.returnStackTopsToDeck([originalTop.instanceId, h.s.inst("upper").instanceId], {
      byEffectSeat: 1,
      byEffectCardId: "BT26-060",
    });

    expect(moved.map(({ instanceId }) => instanceId)).toEqual([originalTop.instanceId, h.s.inst("upper").instanceId]);
    expect(h.s.perm("host").topCard.instanceId).toBe(h.s.inst("bottom").instanceId);
    expect(h.s.perm("host").stack).toHaveLength(0);
    expect(h.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      originalTop.instanceId,
      h.s.inst("upper").instanceId,
    ]);
    expect(h.subTriggerFires).toEqual([
      {
        event: "whenEffectAddsToDeck",
        payload: { effectAddedToDeckSeat: 0, effectAddedToDeckBySeat: 1, byEffectCardId: "BT26-060" },
      },
    ]);
  });

  it("trashPermanentByRule moves the whole invalid position without deletion or trash-by-effect reactions", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            {
              card: TAMER,
              as: "invalid",
              under: [{ card: DIGIMON, as: "source" }],
              linked: [{ card: OPTION, as: "link" }],
            },
          ],
        },
      },
    });

    const moved = await h.fx.trashPermanentByRule([h.s.perm("invalid").permanentId]);

    expect(moved.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([
        h.s.inst("invalid").instanceId,
        h.s.inst("source").instanceId,
        h.s.inst("link").instanceId,
      ]),
    );
    expect(h.state.players[0]!.battleArea).toHaveLength(0);
    expect(h.fireTimings).toEqual([]);
    expect(h.subTriggerFires).toEqual([]);
    expect(h.leavePreventionCalls).toEqual([]);
  });
});

describe("primitives: reveal / searchDeck / addSecurity", () => {
  it("reveal flips the top N deck cards face-up in place", async () => {
    const h = harness({ board: { 0: { deck: [DIGIMON, TAMER, OPTION] } } });
    const revealed = await h.fx.reveal(0, 2);
    expect(revealed).toHaveLength(2);
    expect(h.state.players[0]!.deck[0]!.faceUp).toBe(true);
    expect(h.state.players[0]!.deck[2]!.faceUp).toBe(false); // third not revealed
    expect(h.state.players[0]!.deck).toHaveLength(3); // stays in deck
  });

  it("reveal publishes one cardRevealed per card, because a face-up deck card is still private state", async () => {
    const h = harness({ board: { 0: { deck: [DIGIMON, TAMER, OPTION] } } });
    await h.fx.reveal(0, 2);
    expect(h.events.filter(({ kind }) => kind === "cardRevealed")).toEqual([
      { kind: "cardRevealed", seat: 0, cardId: DIGIMON },
      { kind: "cardRevealed", seat: 0, cardId: TAMER },
    ]);
  });

  it("reveal names the effect source on each cardRevealed so the viewer can attribute the reveal", async () => {
    const h = harness({ board: { 0: { deck: [DIGIMON, TAMER] } } });
    await h.fx.reveal(0, 1, OPTION);
    expect(h.events.filter(({ kind }) => kind === "cardRevealed")).toEqual([
      { kind: "cardRevealed", seat: 0, cardId: DIGIMON, sourceCardId: OPTION },
    ]);
  });

  it("reveal publishes nothing for an empty deck", async () => {
    const h = harness({ board: { 0: { deck: [] } } });
    await h.fx.reveal(0, 2);
    expect(h.events.filter(({ kind }) => kind === "cardRevealed")).toEqual([]);
  });

  it("searchDeck adds the controller's chosen matching card to hand and re-hides the deck", async () => {
    const h = harness({
      board: {
        0: {
          deck: [
            { card: DIGIMON, as: "digi" },
            { card: OPTION, as: "option" },
          ],
        },
      },
    });
    const digiId = h.s.inst("digi").instanceId;
    h.selections.push([digiId]); // controller picks the Digimon

    const added = await h.fx.searchDeck(0, (def) => def.kinds.includes(CardKind.Digimon), { min: 1, max: 1 });
    expect(added.map((c) => c.instanceId)).toEqual([digiId]);
    expect(h.state.players[0]!.hand.map((c) => c.instanceId)).toEqual([digiId]);
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      { kind: "cardsMoved", instanceIds: [digiId], from: "deck", to: "hand", seat: 0, handAddition: "transfer" },
    ]);
    // remaining deck card re-hidden
    expect(h.state.players[0]!.deck.every((c) => c.faceUp === false)).toBe(true);
  });

  it("searchDeck returns nothing when no card matches the filter", async () => {
    const h = harness({ board: { 0: { deck: [OPTION] } } });
    const added = await h.fx.searchDeck(0, (def) => def.kinds.includes(CardKind.Digimon));
    expect(added).toHaveLength(0);
  });

  it.each(["hand", "deck", "security"] as const)(
    "hand/deck return immunity permits only security placement (%s)",
    async (destination) => {
      const h = harness({ board: { 0: { battleArea: [battleDigimon("guarded", 4000)] } } });
      const perm = h.s.perm("guarded");
      h.fx.restrict(perm.permanentId, "beReturned", EffectDuration.UntilOpponentTurnEnd);
      if (destination === "hand") await h.fx.returnToHand([perm.topCard.instanceId]);
      else if (destination === "deck") await h.fx.returnToDeck([perm.topCard.instanceId]);
      else await h.fx.addSecurity(0, [perm.topCard.instanceId]);
      expect(h.state.players[0]!.battleArea.includes(perm)).toBe(destination !== "security");
      expect(h.state.players[0]!.security.map((c) => c.instanceId)).toEqual(
        destination === "security" ? [perm.topCard.instanceId] : [],
      );
      expect(h.state.players[0]!.hand).toHaveLength(0);
      expect(h.state.players[0]!.deck).toHaveLength(0);
    },
  );

  it("security placement still respects the broader non-deletion leave lock", async () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("guarded", 4000)] } } });
    const perm = h.s.perm("guarded");
    h.fx.restrict(perm.permanentId, "leaveBattleAreaExceptByDeletion", EffectDuration.UntilOpponentTurnEnd);
    await h.fx.addSecurity(0, [perm.topCard.instanceId]);
    expect(h.state.players[0]!.battleArea).toContain(perm);
    expect(h.state.players[0]!.security).toHaveLength(0);
    expect(h.leavePreventionCalls).toHaveLength(0);
  });

  it("addSecurity places loose cards onto the security stack face-down", async () => {
    const h = harness({ board: { 0: { hand: [{ card: TAMER, as: "c" }] } } });
    const cId = h.s.inst("c").instanceId;
    await h.fx.addSecurity(0, [cId], { toTop: true });
    expect(h.state.players[0]!.security[0]!.instanceId).toBe(cId);
    expect(h.state.players[0]!.security[0]!.faceUp).toBe(false);
    expect(h.state.players[0]!.hand).toHaveLength(0);
  });

  it("addSecurity moves only a permanent's top card to security and trashes its attachments", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            {
              card: DIGIMON,
              as: "stacked",
              dp: 4_000,
              under: [{ card: TAMER, as: "source" }],
            },
          ],
        },
      },
    });
    const topId = h.s.perm("stacked").topCard.instanceId;
    const sourceId = h.s.inst("source").instanceId;

    await h.fx.addSecurity(0, [topId], { toTop: true });

    expect(h.state.players[0]!.security.map((card) => card.instanceId)).toEqual([topId]);
    expect(h.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([sourceId]);
    expect(h.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("addSecurity can shed only a permanent's top card and promote its digivolution card", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            {
              card: DIGIMON,
              as: "stacked",
              dp: 4_000,
              under: [{ card: TAMER, as: "promoted" }],
            },
          ],
        },
      },
    });
    const permanentId = h.s.perm("stacked").permanentId;
    const topId = h.s.perm("stacked").topCard.instanceId;
    const promotedId = h.s.inst("promoted").instanceId;

    await h.fx.addSecurity(0, [topId], { toTop: true, detachPermanentTop: true });

    expect(h.state.players[0]!.security.map((card) => card.instanceId)).toEqual([topId]);
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(h.state.players[0]!.battleArea[0]!.permanentId).toBe(permanentId);
    expect(h.state.players[0]!.battleArea[0]!.topCard.instanceId).toBe(promotedId);
    expect(h.state.players[0]!.battleArea[0]!.stack).toHaveLength(0);
    expect(h.state.players[0]!.trash).toHaveLength(0);
  });

  it("addSecurity with faceUp:true places the card FACE UP at the bottom (BT25-102)", async () => {
    // the existing card is the bottom-to-be
    const h = harness({ board: { 0: { security: [OPTION], hand: [{ card: TAMER, as: "c" }] } } });
    const cId = h.s.inst("c").instanceId;
    await h.fx.addSecurity(0, [cId], { toTop: false, faceUp: true });
    const sec = h.state.players[0]!.security;
    expect(sec[sec.length - 1]!.instanceId).toBe(cId); // bottom
    expect(sec[sec.length - 1]!.faceUp).toBe(true); // revealed
  });

  // Finding 14: a battle-area permanent moved to security is LEAVING THE BATTLE AREA, exactly
  // like returnToHand/returnToDeck's bounce — an active "would leave the battle area" PREVENT
  // reaction must be able to save it. addSecurity previously skipped the consult entirely.
  it("addSecurity respects an active leave-prevention reaction for a field permanent (finding 14)", async () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("guarded", 4000)] } } });
    const perm = h.s.perm("guarded");
    h.preventedPermanentIds.add(perm.permanentId);

    await h.fx.addSecurity(0, [perm.topCard.instanceId]);

    // The consult was actually invoked for this permanent...
    expect(h.leavePreventionCalls.some((c) => c.permanentIds.includes(perm.permanentId))).toBe(true);
    // ...and the prevention held: the permanent never left the battle area / entered security.
    expect(h.state.players[0]!.battleArea).toContain(perm);
    expect(h.state.players[0]!.security).toHaveLength(0);
  });

  // The prevention consult only ever matches battle-area permanent top-cards
  // (filterBouncePrevented). A card sourced from hand/deck/trash is not "leaving the battle
  // area" and must go to security even while a leave-prevention reaction is globally active.
  it("addSecurity does NOT gate loose hand/deck/trash cards on leave-prevention", async () => {
    const h = harness({
      board: { 0: { battleArea: [battleDigimon("guarded", 4000)], hand: [{ card: TAMER, as: "c" }] } },
    });
    h.preventedPermanentIds.add(h.s.perm("guarded").permanentId); // active reaction, unrelated to this card

    const cId = h.s.inst("c").instanceId;
    await h.fx.addSecurity(0, [cId]);

    expect(h.state.players[0]!.security.map((s) => s.instanceId)).toContain(cId);
    expect(h.state.players[0]!.hand).toHaveLength(0);
  });
});

describe("primitives: flipSecurityFaceUp (EX11-064)", () => {
  it("flips the top FACE-DOWN security card face up, leaving it in security", () => {
    // index 0 = top
    const h = harness({
      board: {
        1: {
          security: [
            { card: DIGIMON, as: "top" },
            { card: OPTION, as: "bottom" },
          ],
        },
      },
    });
    const topId = h.s.inst("top").instanceId;
    const flipped = h.fx.flipSecurityFaceUp(1, { fromTop: true });
    expect(flipped).toBe(true);
    expect(h.state.players[1]!.security[0]!.instanceId).toBe(topId);
    expect(h.state.players[1]!.security[0]!.faceUp).toBe(true); // now revealed
    expect(h.state.players[1]!.security[1]!.faceUp).toBe(false); // others untouched
    expect(h.state.players[1]!.security).toHaveLength(2); // stays in the stack
  });

  it("flips the FIRST face-down card, skipping an already-face-up top card", () => {
    const h = harness({
      board: {
        1: {
          security: [
            { card: DIGIMON, as: "alreadyUp", faceUp: true },
            { card: OPTION, as: "faceDown" },
          ],
        },
      },
    });
    const flipped = h.fx.flipSecurityFaceUp(1, { fromTop: true });
    expect(flipped).toBe(true);
    expect(h.state.players[1]!.security[1]!.faceUp).toBe(true); // the second was flipped
  });

  it("is a no-op (returns false) when there is no face-down security card", () => {
    // already face-up
    const h = harness({ board: { 1: { security: [{ card: DIGIMON, faceUp: true }] } } });
    expect(h.fx.flipSecurityFaceUp(1)).toBe(false);
  });
});

describe("primitives: flipSecurityFaceDown (revealed security restoration)", () => {
  it("hides only the requested face-up instance and emits an in-place security event", () => {
    const h = harness({
      board: {
        0: {
          security: [
            { card: DIGIMON, as: "other", faceUp: true },
            { card: OPTION, as: "target", faceUp: true },
          ],
        },
      },
    });
    const otherId = h.s.inst("other").instanceId;
    const targetId = h.s.inst("target").instanceId;

    expect(h.fx.flipSecurityFaceDown!(0, targetId)).toBe(true);
    expect(h.state.players[0]!.security.find((card) => card.instanceId === otherId)!.faceUp).toBe(true);
    expect(h.state.players[0]!.security.find((card) => card.instanceId === targetId)!.faceUp).toBe(false);
    expect(h.events).toContainEqual({ kind: "cardsMoved", instanceIds: [targetId], from: "security", to: "security" });
    expect(h.subTriggerFires).toHaveLength(0);
    expect(h.fx.flipSecurityFaceDown!(0, "missing")).toBe(false);
    expect(h.fx.flipSecurityFaceDown!(0, targetId)).toBe(false);
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toHaveLength(1);
  });
});

describe("primitives: playInstances (filtered PlayWithoutCost)", () => {
  it("preflights a paid effect play with the same explicit reduction used by the play", async () => {
    const h = harness({ memory: 0, board: { 0: { trash: [{ card: "BT1-043", as: "c" }] } } });
    const instanceId = h.s.inst("c").instanceId;

    expect(await h.fx.canAffordEffectPlay!(instanceId)).toBe(false);
    expect(await h.fx.canAffordEffectPlay!(instanceId, { costDelta: 1 })).toBe(true);
    expect(h.state.players[0]!.trash).toHaveLength(1);
    expect(h.state.memory).toBe(0);
  });

  it("allows an affordable reduced Option while a pending effect resolves after memory crossed", async () => {
    const h = harness({ memory: -3, board: { 0: { trash: [{ card: "BT24-098", as: "option" }] } } });
    const instanceId = h.s.inst("option").instanceId;

    expect(await h.fx.canAffordEffectPlay!(instanceId, { costDelta: 2, useAsOption: true, controllerSeat: 0 })).toBe(
      true,
    );
    expect(h.state.players[0]!.trash.map(({ instanceId: id }) => id)).toEqual([instanceId]);
    expect(h.state.memory).toBe(-3);
  });

  it("honors play-cost reduction restrictions during affordability preflight", async () => {
    const h = harness({ memory: -6, board: { 0: { trash: [{ card: DIGIMON, as: "c" }] } } });
    h.fx.restrictCostReduction(0, "play", EffectDuration.UntilOwnerTurnEnd);

    expect(await h.fx.canAffordEffectPlay!(h.s.inst("c").instanceId, { costDelta: 1 })).toBe(false);
  });

  it("plays a chosen loose card from trash as a new permanent (free)", async () => {
    const h = harness({ board: { 0: { trash: [{ card: DIGIMON, as: "c" }] } } });
    const created = await h.fx.playInstances([h.s.inst("c").instanceId]);
    expect(created).toHaveLength(1);
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(h.state.players[0]!.trash).toHaveLength(0);
    expect(created[0]!.baseDP).toBe(5000);
  });

  it("plays a loose card from under another permanent (a Tamer's digivolution stack)", async () => {
    const h = harness({
      board: {
        0: { battleArea: [{ card: DIGIMON, as: "t1", dp: 0, under: [{ card: DIGIMON, as: "under" }] }] },
      },
    });
    const tamer = h.s.perm("t1");
    const created = await h.fx.playInstances([h.s.inst("under").instanceId]);
    expect(created).toHaveLength(1);
    expect(tamer.stack).toHaveLength(0); // pulled out from under the Tamer
    expect(h.state.players[0]!.battleArea).toHaveLength(2); // tamer + new permanent
  });

  it("skips an Option (not a permanent kind)", async () => {
    const h = harness({ board: { 0: { hand: [{ card: OPTION, as: "c" }] } } });
    const created = await h.fx.playInstances([h.s.inst("c").instanceId]);
    expect(created).toHaveLength(0);
    expect(h.state.players[0]!.hand).toHaveLength(1);
  });

  it("publishes every permanent created by one simultaneous whenPlayed event", async () => {
    const h = harness({
      board: {
        0: {
          hand: [
            { card: DIGIMON, as: "first" },
            { card: DIGIMON, as: "second" },
          ],
        },
      },
    });

    const created = await h.fx.playInstances([h.s.inst("first").instanceId, h.s.inst("second").instanceId]);

    expect(created).toHaveLength(2);
    expect(h.subTriggerFires.filter(({ event }) => event === "whenPlayed")).toEqual([
      {
        event: "whenPlayed",
        payload: expect.objectContaining({
          subjectPermanentId: created[0]!.permanentId,
          subjectPermanentIds: created.map(({ permanentId }) => permanentId),
          playedByEffect: true,
        }),
      },
    ]);
  });
});

describe("primitives: digivolveFromInstance (effect-driven digivolve)", () => {
  describe.each([
    { label: "paid", options: { payCost: true }, cost: 5 },
    { label: "free", options: { payCost: false }, cost: 0 },
    { label: "reduced", options: { payCost: true, costDelta: -3 }, cost: 2 },
    { label: "fixed", options: { payCost: true, costOverride: 1 }, cost: 1 },
    {
      label: "alternate with level ignored",
      options: { payCost: true, ignoreLevel: true, useAlternateCost: true },
      cost: 5,
    },
  ])("Jesmon live DP gate on the $label path", ({ options, cost }) => {
    it.each([
      { zone: "hand", dp: 0 },
      { zone: "hand", dp: 9999 },
      { zone: "hand", dp: 10000 },
      { zone: "trash", dp: 9999 },
      { zone: "trash", dp: 10000 },
    ] as const)("checks the current opponent DP ($dp) when evolving from $zone", async ({ zone, dp }) => {
      const h = harness({
        memory: 10,
        board: {
          0: {
            battleArea: [{ card: "EX13-009", as: "huckmon" }],
            [zone]: [{ card: "BT23-013", as: "jesmon" }],
          },
          1: { battleArea: dp > 0 ? [{ card: "AD1-010", dp, as: "opponent" }] : [] },
        },
      });
      const base = h.s.perm("huckmon");
      const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("jesmon").instanceId, options);
      const eligible = dp >= 10000;

      expect(result !== undefined).toBe(eligible);
      expect(base.topCard.cardId).toBe(eligible ? "BT23-013" : "EX13-009");
      expect(h.state.memory).toBe(eligible ? 10 - cost : 10);
      expect(h.state.players[0]![zone].some((card) => card.instanceId === h.s.inst("jesmon").instanceId)).toBe(
        !eligible,
      );
    });
  });

  it.each([true, false])("retains an explicit requirements waiver for Jesmon (payCost=%s)", async (payCost) => {
    const h = harness({
      memory: 10,
      board: {
        0: { battleArea: [{ card: "EX13-009", as: "huckmon" }], hand: [{ card: "BT23-013", as: "jesmon" }] },
      },
    });
    const result = await h.fx.digivolveFromInstance(h.s.perm("huckmon").permanentId, h.s.inst("jesmon").instanceId, {
      payCost,
      ignoreRequirements: true,
    });
    expect(result).toBeDefined();
    expect(h.s.perm("huckmon").topCard.cardId).toBe("BT23-013");
    expect(h.state.memory).toBe(payCost ? 6 : 10);
  });

  it.each([
    { label: "paid", payCost: true, expectedMemory: 7 },
    { label: "free", payCost: false, expectedMemory: 10 },
  ])("accepts the RB1-009 Gammamon-text stack gate on the $label path", async ({ payCost, expectedMemory }) => {
    const h = harness({
      memory: 10,
      board: {
        0: {
          battleArea: [{ card: "RB1-005", as: "base", under: ["RB1-008"] }],
          hand: [{ card: "RB1-009", as: "evolving" }],
        },
      },
    });
    const base = h.s.perm("base");
    const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("evolving").instanceId, { payCost });

    expect(result).toBeDefined();
    expect(h.state.memory).toBe(expectedMemory);
    expect(base.stack.map((card) => card.cardId)).toEqual(["RB1-008", "RB1-005"]);
  });

  it.each([true, false])("rejects the RB1-009 stack gate without Gammamon text (payCost=%s)", async (payCost) => {
    const h = harness({
      memory: 10,
      board: {
        0: {
          battleArea: [{ card: "RB1-005", as: "base", under: ["RB1-011"] }],
          hand: [{ card: "RB1-009", as: "evolving" }],
        },
      },
    });
    const base = h.s.perm("base");
    const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("evolving").instanceId, { payCost });

    expect(result).toBeUndefined();
    expect(h.state.memory).toBe(10);
    expect(h.state.players[0]!.hand).toHaveLength(1);
    expect(base.topCard.cardId).toBe("RB1-005");
  });

  it("stacks a loose hand card onto a target permanent, prior top sliding under", async () => {
    const h = harness({
      board: {
        // AD1-001, DP 5000 in hand
        0: { battleArea: [battleDigimon("p1", 3000)], hand: [{ card: DIGIMON, as: "evolving" }] },
      },
    });
    const base = h.s.perm("p1");
    const baseTopId = base.topCard.instanceId;
    const evolvingId = h.s.inst("evolving").instanceId;

    // This test asserts the raw stacking mechanic (top-card swap, DP carry, hand drain), not
    // digivolution-requirement legality; ignoreRequirements isolates it from the requirement gate.
    const result = await h.fx.digivolveFromInstance(base.permanentId, evolvingId, { ignoreRequirements: true });
    expect(result).toBeDefined();
    expect(base.topCard.instanceId).toBe(evolvingId);
    expect(base.stack.map((c) => c.instanceId)).toContain(baseTopId);
    expect(base.baseDP).toBe(5000);
    expect(h.state.players[0]!.hand).toHaveLength(0);
    expect(h.events).toContainEqual(
      expect.objectContaining({
        kind: "digivolved",
        seat: 0,
        permanentId: base.permanentId,
        cardId: DIGIMON,
        mechanic: "normal",
      }),
    );
  });

  // A paid effect-digivolve priced the base against the PRINTED EvoCosts only. A Tamer base
  // has no level and so matches no printed EvoCost — every alternate-requirement path
  // ("[Digivolve] [BurningGreymon]: Cost 0", "onto a red Tamer: Cost 2") was rejected and the
  // digivolve returned undefined with no feedback, after the controller had already picked
  // both cards (BT21-082's [Start of Your Main Phase]). runDigivolve's candidate filter does
  // consult the alternates, so the two gates disagreed.
  it("prices a paid digivolve off the alternate digivolution requirement when no printed EvoCost matches", async () => {
    const RED_TAMER = "BT1-085"; // Tai Kamiya — red Tamer
    const HYBRID = "BT21-013"; // Agunimon — alternate requirement: red Tamer base, cost 2
    const h = harness({
      board: { 0: { battleArea: [{ card: RED_TAMER, as: "tamer" }], hand: [{ card: HYBRID, as: "hybrid" }] } },
    });
    const base = h.s.perm("tamer");
    const hybridId = h.s.inst("hybrid").instanceId;

    const result = await h.fx.digivolveFromInstance(base.permanentId, hybridId, { payCost: true });

    expect(result, "a Tamer base qualifying via an alternate requirement must digivolve").toBeDefined();
    expect(base.topCard.instanceId).toBe(hybridId);
    expect(h.state.players[0]!.hand).toHaveLength(0);
  });

  it("uses a selected alternate cost and enforces its digivolution-stack name gate", async () => {
    const h = harness({
      memory: 5,
      board: {
        0: {
          battleArea: [
            {
              card: "BT6-111",
              as: "alphamon",
              under: ["BT8-069"],
            },
          ],
          hand: [{ card: "BT9-111", as: "ouryuken" }],
        },
      },
    });
    const base = h.s.perm("alphamon");

    const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("ouryuken").instanceId, {
      payCost: true,
      useAlternateCost: true,
    });

    expect(result).toBeDefined();
    expect(h.state.memory).toBe(2);
    expect(base.topCard.cardId).toBe("BT9-111");
  });

  it("rejects a selected alternate cost when its required named source is absent", async () => {
    const h = harness({
      memory: 7,
      board: {
        0: {
          battleArea: [{ card: "BT6-111", as: "alphamon" }],
          hand: [{ card: "BT9-111", as: "ouryuken" }],
        },
      },
    });

    const result = await h.fx.digivolveFromInstance(h.s.perm("alphamon").permanentId, h.s.inst("ouryuken").instanceId, {
      payCost: true,
      useAlternateCost: true,
    });

    expect(result).toBeUndefined();
    expect(h.state.memory).toBe(7);
    expect(h.state.players[0]!.hand).toHaveLength(1);
  });
});

describe("primitives: deDigivolve", () => {
  it("moves the top card to the trash and promotes the card beneath", async () => {
    // the under card becomes the new top after de-digivolve
    const h = harness({
      board: {
        0: { battleArea: [{ card: DIGIMON, as: "p1", dp: 5000, under: [{ card: TAMER, as: "under" }] }] },
      },
    });
    const p = h.s.perm("p1");
    const oldTopId = p.topCard.instanceId;
    const underId = h.s.inst("under").instanceId;

    const moved = await h.fx.deDigivolve(p.permanentId, 1);
    expect(moved.map((c) => c.instanceId)).toEqual([oldTopId]);
    expect(p.topCard.instanceId).toBe(underId);
    expect(p.stack).toHaveLength(0);
    expect(h.state.players[0]!.trash.at(-1)!.instanceId).toBe(oldTopId);
  });

  it("is a no-op when the Digimon has no digivolution cards", async () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("p1", 5000)] } } });
    const p = h.s.perm("p1");
    const moved = await h.fx.deDigivolve(p.permanentId, 3);
    expect(moved).toHaveLength(0);
    expect(p.stack).toHaveLength(0);
  });

  it("continues a single De-Digivolve through an Option top (CR 16-12-6)", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            {
              card: "BT1-020",
              as: "host",
              under: [
                { card: "BT1-009", as: "level3" },
                { card: "BT9-109", as: "xAntibody" },
              ],
            },
          ],
        },
      },
    });
    const p = h.s.perm("host");
    const oldTopId = p.topCard.instanceId;

    const moved = await h.fx.deDigivolve(p.permanentId, 3);

    expect(moved.map(({ instanceId }) => instanceId)).toEqual([oldTopId, h.s.inst("xAntibody").instanceId]);
    expect(p.topCard.instanceId).toBe(h.s.inst("level3").instanceId);
    expect(p.stack).toHaveLength(0);
  });
});

describe("primitives: stripped stack tops stay public", () => {
  it("trashStackTops marks the movement as a top-card trash, face up, with the host and no source", async () => {
    const h = harness({
      board: {
        0: { battleArea: [{ card: DIGIMON, as: "p1", dp: 5000, under: [{ card: TAMER, as: "under" }] }] },
      },
    });
    const p = h.s.perm("p1");
    const oldTop = p.topCard;

    await h.fx.trashStackTops(p.permanentId, 1);

    expect(oldTop.faceUp).toBe(true);
    expect(h.events).toContainEqual(
      expect.objectContaining({
        kind: "cardsMoved",
        instanceIds: [oldTop.instanceId],
        cardIds: [DIGIMON],
        seat: 0,
        strippedStackTops: { permanentId: p.permanentId, reason: "trashTop" },
      }),
    );
  });
});

describe("primitives: placeUnder / link", () => {
  it("placeUnder puts loose cards into a permanent's digivolution stack", async () => {
    const h = harness({
      board: { 0: { battleArea: [battleDigimon("p1", 5000)], hand: [{ card: DIGIMON, as: "c" }] } },
    });
    const p = h.s.perm("p1");
    const cId = h.s.inst("c").instanceId;
    const placed = await h.fx.placeUnder(p.permanentId, [cId], { belowTop: true });
    expect(placed).toHaveLength(1);
    expect(p.stack.map((x) => x.instanceId)).toContain(cId);
    expect(h.state.players[0]!.hand).toHaveLength(0);
  });

  it.each([true, false, undefined])(
    "supplemental loose placement position agrees with physical stack: belowTop %s",
    async (belowTop) => {
      const h = harness({
        board: {
          0: {
            battleArea: [{ card: DIGIMON, as: "dest", under: [{ card: OPTION, as: "existing" }] }],
            hand: [{ card: DIGIMON, as: "placed" }],
          },
        },
      });
      const placedId = h.s.inst("placed").instanceId;
      const oldId = h.s.inst("existing").instanceId;
      await h.fx.placeUnder(h.s.perm("dest").permanentId, [placedId], { belowTop });
      expect(h.s.perm("dest").stack.map((card) => card.instanceId)).toEqual(
        belowTop ? [oldId, placedId] : [placedId, oldId],
      );
      expect(h.subTriggerFires).toHaveLength(1);
      expect(h.subTriggerFires[0]!.payload).toMatchObject({
        addedDigivolutionCardInstanceIds: [placedId],
        addedDigivolutionCardsPosition: belowTop ? "top" : "bottom",
      });
    },
  );

  it.each([true, false, undefined])(
    "supplemental batch relocation position agrees with physical stack: belowTop %s",
    async (belowTop) => {
      const h = harness({
        board: {
          0: {
            battleArea: [
              { card: DIGIMON, as: "dest", under: [{ card: OPTION, as: "existing" }] },
              { card: DIGIMON, as: "source" },
            ],
          },
        },
      });
      const placedId = h.s.inst("source").instanceId;
      const oldId = h.s.inst("existing").instanceId;
      const sourcePermanentId = h.s.perm("source").permanentId;
      expect(
        await h.fx.relocatePermanentsByEffect?.(h.s.perm("dest").permanentId, [sourcePermanentId], { belowTop }),
      ).toEqual([sourcePermanentId]);
      expect(h.s.perm("dest").stack.map((card) => card.instanceId)).toEqual(
        belowTop === false ? [placedId, oldId] : [oldId, placedId],
      );
      expect(h.subTriggerFires.map(({ event }) => event)).toEqual(["whenLeavesPlay", "onAddDigivolutionCards"]);
      expect(h.subTriggerFires[1]!.payload).toMatchObject({
        addedDigivolutionCardsPosition: belowTop === false ? "bottom" : "top",
      });
    },
  );

  it("trashDigivolutionCards reveals a face-down stacked card in trash (BT26-094 Q7159)", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            {
              card: TAMER,
              as: "tamer",
              under: [{ card: DIGIMON, faceUp: false, as: "hidden" }],
            },
          ],
        },
      },
    });
    const hiddenId = h.s.inst("hidden").instanceId;

    const moved = await h.fx.trashDigivolutionCards(h.s.perm("tamer").permanentId, [hiddenId]);

    expect(moved).toHaveLength(1);
    expect(h.state.players[0]!.trash.find((card) => card.instanceId === hiddenId)).toMatchObject({ faceUp: true });
  });

  it("Discord 1557413340161253496: rejects a mixed battle/breeding atomic source cost without partial payment", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [{ card: DIGIMON, as: "battle", under: [{ card: TAMER, as: "fuel" }] }],
          breeding: { card: DIGIMON, as: "breeding", under: [{ card: "EX8-005", as: "egg" }] },
        },
      },
    });
    const fuel = h.s.inst("fuel").instanceId;
    const egg = h.s.inst("egg").instanceId;
    expect(h.fx.canTrashDigivolutionCard?.(egg)).toBe(false);
    const moved = await h.fx.trashDigivolutionCardsAtomic(
      [
        { hostPermanentId: h.s.perm("battle").permanentId, instanceId: fuel },
        { hostPermanentId: h.s.perm("breeding").permanentId, instanceId: egg },
      ],
      2,
      { byEffectSeat: 0 },
    );
    expect(moved).toEqual([]);
    expect(await h.fx.trashDigivolutionCards(h.s.perm("breeding").permanentId, [egg], { byEffectSeat: 0 })).toEqual([]);
    expect(await h.fx.trashDigivolutionCards(h.s.perm("battle").permanentId, [egg], { byEffectSeat: 0 })).toEqual([]);
    expect(h.s.perm("battle").stack.map(({ instanceId }) => instanceId)).toEqual([fuel]);
    expect(h.s.perm("breeding").stack.map(({ instanceId }) => instanceId)).toEqual([egg]);
    expect(h.state.players[0]!.trash).toHaveLength(0);
    expect(h.events).toHaveLength(0);
    expect(h.subTriggerFires).toHaveLength(0);
  });

  it("atomically trashes an exact cross-host digivolution-card cost before publishing watchers", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            { card: DIGIMON, as: "a", under: [{ card: TAMER, as: "costA" }] },
            { card: DIGIMON, as: "b", under: [{ card: OPTION, as: "costB" }] },
          ],
        },
      },
    });
    const selections = [
      { hostPermanentId: h.s.perm("a").permanentId, instanceId: h.s.inst("costA").instanceId },
      { hostPermanentId: h.s.perm("b").permanentId, instanceId: h.s.inst("costB").instanceId },
    ];

    const moved = await h.fx.trashDigivolutionCardsAtomic(selections, 2, { byEffectSeat: 0 });

    expect(moved.map(({ instanceId }) => instanceId)).toEqual(selections.map(({ instanceId }) => instanceId));
    expect(h.s.perm("a").stack).toHaveLength(0);
    expect(h.s.perm("b").stack).toHaveLength(0);
    expect(h.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining(selections.map(({ instanceId }) => instanceId)),
    );
    expect(h.events.filter(({ kind }) => kind === "cardsMoved")).toEqual(
      selections.map(({ hostPermanentId, instanceId }) => ({
        kind: "cardsMoved",
        instanceIds: [instanceId],
        from: "digivolutionCards",
        fromSeat: 0,
        fromHost: { permanentId: hostPermanentId, hostCardId: DIGIMON },
        to: "trash",
      })),
    );
    expect(h.subTriggerFires[0]?.event).toBe("onDigivolutionCardsDiscardedBatch");
  });

  it("moves nothing and publishes nothing when one member of an exact atomic cost is protected", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            { card: DIGIMON, as: "a", under: [{ card: TAMER, as: "protected" }] },
            { card: DIGIMON, as: "b", under: [{ card: OPTION, as: "other" }] },
          ],
        },
      },
    });
    const protectedId = h.s.inst("protected").instanceId;
    const otherId = h.s.inst("other").instanceId;
    h.continuous.addStackCardTrashLock(protectedId, 0, EffectDuration.Permanent);

    const moved = await h.fx.trashDigivolutionCardsAtomic(
      [
        { hostPermanentId: h.s.perm("a").permanentId, instanceId: protectedId },
        { hostPermanentId: h.s.perm("b").permanentId, instanceId: otherId },
      ],
      2,
      { byEffectSeat: 0 },
    );

    expect(moved).toEqual([]);
    expect(h.s.perm("a").stack.map(({ instanceId }) => instanceId)).toEqual([protectedId]);
    expect(h.s.perm("b").stack.map(({ instanceId }) => instanceId)).toEqual([otherId]);
    expect(h.state.players[0]!.trash).toHaveLength(0);
    expect(h.events).toHaveLength(0);
    expect(h.subTriggerFires).toHaveLength(0);
  });

  it("link moves loose cards into a permanent's linked list", async () => {
    const h = harness({
      board: { 0: { battleArea: [battleDigimon("p1", 5000)], hand: [{ card: DIGIMON, as: "c" }] } },
    });
    const p = h.s.perm("p1");
    const cId = h.s.inst("c").instanceId;
    const linked = await h.fx.link(p.permanentId, [cId]);
    expect(linked).toHaveLength(1);
    expect(p.linked.map((x) => x.instanceId)).toContain(cId);
  });

  // WR-02: relocatePermanent is a true leave — the source permanentId is spliced out and
  // ceases to exist (its cards re-attach under dest). Before the fix it dropped only the
  // modifier + continuous ledgers and OMITTED subTriggers.dropPermanent, so a stale
  // reduceCost/prevent replacement or a watcher anchored to the relocated source survived
  // in the registry. The costReductionFor/replacementsFor reads have no anchor guard, so a
  // dead source's stale reduceCost would still discount a later cost — the same wrong path
  // CR-01 closed for the combat/security seams, surviving in a third leave seam.
  //
  // FAILS-WHEN-REVERTED: dropping the subTriggers teardown from relocatePermanent (reverting
  // to the bare ledger + continuous drop) leaves costReductionFor returning 2 (not 0) and the
  // watcher subscription non-empty.
  it("relocatePermanent tears down the moved source's subTrigger replacements + watchers (WR-02)", () => {
    const h = harness({
      turnSeat: 0,
      board: { 0: { battleArea: [battleDigimon("dest", 5000), battleDigimon("source", 3000)] } },
    });
    const destId = h.s.perm("dest").permanentId;
    const sourceId = h.s.perm("source").permanentId;

    h.subTriggers.subscribeReplacement({
      event: "wouldDigivolve",
      sourcePermanentId: sourceId,
      mode: "reduceCost",
      amount: 2,
      description: "test: stale digivolve-cost reduction from a relocated source",
    });
    h.subTriggers.subscribe({
      event: "onDeletionOf",
      sourcePermanentId: sourceId,
      once: false,
      run: async () => {},
      description: "test: stale onDeletionOf watcher from a relocated source",
    });
    // Sanity: live BEFORE the relocate (so the post-move assertion measures a real drop).
    expect(h.subTriggers.costReductionFor("wouldDigivolve", sourceId)).toBe(2);

    expect(h.fx.relocatePermanent(destId, sourceId)).toBe(true);

    // The source left the field, so its three ledgers were torn down together.
    expect(h.subTriggers.costReductionFor("wouldDigivolve", sourceId)).toBe(0);
    expect(h.subTriggers.subscriptionsFor("onDeletionOf", sourceId)).toHaveLength(0);
  });

  // Battle-area cards are public and stay face-up when a permanent is placed under another
  // as digivolution cards (KB Q4250/Q4251). Forcing them face-down withheld their cardId
  // from the opponent's StateView forever, rendering card backs in the stack viewer.
  it("relocatePermanent keeps the moved cards face-up", () => {
    const h = harness({
      turnSeat: 0,
      board: { 0: { battleArea: [battleDigimon("dest", 5000), battleDigimon("source", 3000)] } },
    });
    const destId = h.s.perm("dest").permanentId;
    const source = h.s.perm("source");
    const sourceTopId = source.topCard!.instanceId;
    source.topCard!.faceUp = true;

    expect(h.fx.relocatePermanent(destId, source.permanentId)).toBe(true);

    const moved = h.s.perm("dest").stack.find((card) => card.instanceId === sourceTopId);
    expect(moved?.faceUp).toBe(true);
  });

  it.each([
    { batch: false, shed: true },
    { batch: false, shed: false },
    { batch: true, shed: true },
    { batch: true, shed: false },
  ])(
    "supplemental relocation payload reports attached identities only: batch $batch, shedding $shed",
    async ({ batch, shed }) => {
      const h = harness({
        turnSeat: 0,
        board: {
          1: {
            battleArea: [
              { card: DIGIMON, as: "dest", under: [{ card: OPTION, as: "existing" }] },
              {
                card: DIGIMON,
                as: "source",
                under: [{ card: OPTION, as: "under" }],
                linked: [{ card: TAMER, as: "link" }],
              },
            ],
          },
        },
      });
      const destId = h.s.perm("dest").permanentId;
      const sourceId = h.s.perm("source").permanentId;
      const topId = h.s.inst("source").instanceId;
      const attachmentIds = [h.s.inst("under").instanceId, h.s.inst("link").instanceId];
      const opts = { belowTop: true, shedOwnCards: shed };
      const result = batch
        ? await h.fx.relocatePermanentsByEffect?.(destId, [sourceId], opts)
        : await h.fx.relocatePermanentByEffect?.(destId, sourceId, opts);
      expect(result).toEqual(batch ? [sourceId] : true);
      expect(h.subTriggerFires.map(({ event }) => event)).toEqual(["whenLeavesPlay", "onAddDigivolutionCards"]);
      expect(h.subTriggerFires[0]!.payload).toMatchObject({ deletedPermanentId: sourceId });
      expect(h.subTriggerFires[1]!.payload).toMatchObject({
        subjectPermanentId: destId,
        addedDigivolutionCardInstanceIds: shed ? [topId] : [topId, ...attachmentIds],
      });
      expect(h.s.perm("dest").stack.map((card) => card.instanceId)).toEqual([
        h.s.inst("existing").instanceId,
        topId,
        ...(shed ? [] : attachmentIds),
      ]);
      expect(h.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(shed ? attachmentIds : []);
      expect(h.state.players[0]!.trash).toHaveLength(0);
    },
  );

  it("relocatePermanentByEffect awaits the destination's add-digivolution window", async () => {
    const h = harness({
      turnSeat: 0,
      board: { 0: { battleArea: [battleDigimon("dest", 5000), battleDigimon("source", 3000)] } },
    });
    const destId = h.s.perm("dest").permanentId;
    const sourceId = h.s.perm("source").permanentId;
    const sourceInstanceId = h.s.perm("source").topCard!.instanceId;
    h.fx.enterEffectResolution?.(1);
    expect(await h.fx.relocatePermanentByEffect?.(destId, sourceId)).toBe(true);
    h.fx.leaveEffectResolution?.();

    expect(h.subTriggerFires).toContainEqual({
      event: "onAddDigivolutionCards",
      payload: expect.objectContaining({ subjectPermanentId: destId }),
    });
    expect(h.subTriggerFires.find((entry) => entry.event === "onAddDigivolutionCards")?.payload).toMatchObject({
      addedDigivolutionCardInstanceIds: [sourceInstanceId],
      addedDigivolutionCardsPosition: "top",
      byEffectSeat: 1,
    });
    expect(h.s.perm("dest").stack.map(({ cardId }) => cardId)).toContain(DIGIMON);
  });

  it.each(["missing", "duplicate"])(
    "rejects a %s loose placement batch before moving any material",
    async (invalid) => {
      const h = harness({
        turnSeat: 0,
        board: {
          0: {
            battleArea: [battleDigimon("dest", 5000)],
            hand: [{ card: OPTION, as: "material" }],
          },
        },
      });
      const materialId = h.s.inst("material").instanceId;
      const originalHand = h.state.players[0]!.hand.slice();
      expect(
        await h.fx.placeUnder(h.s.perm("dest").permanentId, [
          materialId,
          invalid === "duplicate" ? materialId : "missing",
        ]),
      ).toEqual([]);
      expect(h.state.players[0]!.hand).toEqual(originalHand);
      expect(h.s.perm("dest").stack).toHaveLength(0);
      expect(h.events).toHaveLength(0);
      expect(h.subTriggerFires).toHaveLength(0);
    },
  );

  it.each(["missing", "duplicate"])("preflights a %s mixed batch before its permanent leaves", async (invalid) => {
    const h = harness({
      turnSeat: 0,
      board: {
        0: {
          battleArea: [battleDigimon("dest", 5000), { card: TAMER, as: "tamer" }],
          trash: [{ card: DIGIMON, as: "loose" }],
        },
      },
    });
    const ids = [h.s.inst("tamer").instanceId, h.s.inst("loose").instanceId];
    const result = await h.fx.placeMixedMaterialsUnder?.(h.s.perm("dest").permanentId, [
      ...ids,
      invalid === "missing" ? "missing" : ids[0]!,
    ]);
    expect(result).toEqual([]);
    expect(h.s.perm("tamer").topCard.cardId).toBe(TAMER);
    expect(h.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([ids[1]]);
    expect(h.s.perm("dest").stack).toHaveLength(0);
    expect(h.events).toHaveLength(0);
    expect(h.subTriggerFires).toHaveLength(0);
  });

  it.each(["overlap", "restricted", "destination"])(
    "rejects %s in a mixed batch without moving anything",
    async (invalid) => {
      const h = harness({
        turnSeat: 0,
        board: {
          0: {
            battleArea: [
              battleDigimon("dest", 5000),
              { card: TAMER, as: "tamer", under: [{ card: OPTION, as: "attached" }] },
            ],
            trash: [{ card: DIGIMON, as: "loose" }],
          },
        },
      });
      const tamerId = h.s.inst("tamer").instanceId;
      const attachedId = h.s.inst("attached").instanceId;
      const looseId = h.s.inst("loose").instanceId;
      if (invalid === "restricted")
        h.continuous.addRestriction(
          h.s.perm("tamer").permanentId,
          "leaveBattleAreaExceptByDeletion",
          EffectDuration.Permanent,
        );
      const ids =
        invalid === "destination"
          ? [h.s.perm("dest").topCard.instanceId, looseId]
          : invalid === "overlap"
            ? [tamerId, attachedId, looseId]
            : [tamerId, looseId];
      expect(await h.fx.placeMixedMaterialsUnder?.(h.s.perm("dest").permanentId, ids)).toEqual([]);
      expect(h.s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([attachedId]);
      expect(h.s.perm("dest").stack).toHaveLength(0);
      expect(h.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([looseId]);
      expect(h.events).toHaveLength(0);
      expect(h.subTriggerFires).toHaveLength(0);
    },
  );

  it.each([false, true])(
    "commits mixed bottom order while preserving material sources: attached=%s",
    async (withAttached) => {
      const h = harness({
        turnSeat: 0,
        board: {
          0: {
            battleArea: [
              { card: DIGIMON, as: "dest", under: [{ card: OPTION, as: "existing" }] },
              { card: TAMER, as: "tamer", under: withAttached ? [{ card: OPTION, as: "attached" }] : [] },
            ],
            trash: [{ card: DIGIMON, as: "loose" }],
          },
        },
      });
      const ids = [h.s.inst("loose").instanceId, h.s.inst("tamer").instanceId];
      const attachedIds = withAttached ? [h.s.inst("attached").instanceId] : [];
      const expectedAdded = [ids[0]!, ...attachedIds, ids[1]!];
      const existingId = h.s.inst("existing").instanceId;
      const materialHostId = h.s.perm("tamer").permanentId;
      expect(
        (await h.fx.placeMixedMaterialsUnder?.(h.s.perm("dest").permanentId, ids))?.map((card) => card.instanceId),
      ).toEqual(ids);
      expect(h.s.perm("dest").stack.map((card) => card.instanceId)).toEqual([...expectedAdded, existingId]);
      expect(h.state.players[0]!.battleArea).toHaveLength(1);
      expect(h.state.players[0]!.trash).toHaveLength(0);
      const placement = { to: "battleArea", placedUnder: { permanentId: h.s.perm("dest").permanentId } };
      expect(h.events).toEqual([
        { kind: "cardsMoved", instanceIds: [ids[0]], from: "trash", fromSeat: 0, ...placement },
        ...attachedIds.map((instanceId) => ({
          kind: "cardsMoved",
          instanceIds: [instanceId],
          from: "digivolutionCards",
          fromSeat: 0,
          fromHost: { permanentId: materialHostId, hostCardId: TAMER },
          ...placement,
        })),
        { kind: "cardsMoved", instanceIds: [ids[1]], from: "battleArea", fromSeat: 0, ...placement },
      ]);
      expect(h.subTriggerFires).toHaveLength(1);
      expect(h.subTriggerFires[0]?.payload).toMatchObject({
        addedDigivolutionCardInstanceIds: expectedAdded,
        addedDigivolutionCardsPosition: "bottom",
      });
    },
  );

  it("preflights every multi-source move before touching the destination", async () => {
    const h = harness({
      turnSeat: 0,
      board: { 0: { battleArea: [battleDigimon("dest", 5000), battleDigimon("sourceA", 3000)] } },
    });
    const destination = h.s.perm("dest");
    const source = h.s.perm("sourceA");
    const originalStack = destination.stack.slice();
    const originalBattleArea = h.state.players[0]!.battleArea.slice();
    const moved = await h.fx.relocatePermanentsByEffect?.(destination.permanentId, [source.permanentId, "missing"]);

    // Source A was movable, but stale source B makes the entire payment a no-op.
    expect(moved).toEqual([]);
    expect(h.state.players[0]!.battleArea).toEqual(originalBattleArea);
    expect(destination.stack).toEqual(originalStack);
    expect(h.state.players[0]!.trash).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  it("keeps a multi-source move atomic when one source cannot leave except by deletion", async () => {
    const h = harness({
      turnSeat: 0,
      board: {
        0: {
          battleArea: [battleDigimon("dest", 5000), battleDigimon("sourceA", 3000), battleDigimon("sourceB", 3000)],
        },
      },
    });
    const destination = h.s.perm("dest");
    const sourceA = h.s.perm("sourceA");
    const sourceB = h.s.perm("sourceB");
    const originalStack = destination.stack.slice();
    const originalBattleArea = h.state.players[0]!.battleArea.slice();
    h.continuous.addRestriction(sourceB.permanentId, "leaveBattleAreaExceptByDeletion", EffectDuration.Permanent);

    const moved = await h.fx.relocatePermanentsByEffect?.(destination.permanentId, [
      sourceA.permanentId,
      sourceB.permanentId,
    ]);

    expect(moved).toEqual([]);
    expect(h.state.players[0]!.battleArea).toEqual(originalBattleArea);
    expect(destination.stack).toEqual(originalStack);
    expect(h.state.players[0]!.trash).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  // WR-01 (iteration 3): bounce (returnToHand/returnToDeck/addSecurity, all via
  // collectForReturn) is the sixth leave seam. A bounced permanent's top card going back
  // to hand is a TRUE leave-the-battle-area — the permanentId is spliced out and a re-play
  // makes a NEW id — so its modifier + continuous + subTrigger ledgers must drop, exactly
  // as for delete/DNA-consume/relocate/toBreeding. Before the fix collectForReturn spliced
  // the permanent off the field but never dropped any ledger, so a stale reduceCost/prevent
  // replacement and onDeletionOf/whenAttacking watcher anchored to the bounced source kept
  // discounting / stayed subscribed for the life of the match (costReductionFor/replacementsFor
  // filter on id alone, with no anchor-liveness guard).
  //
  // FAILS-WHEN-REVERTED: drop the `dropPermanentLedgers` callback from the collectForReturn
  // call in returnToHand (revert to the bare `collectForReturn(state, instanceId)`) and
  // costReductionFor returns 2 (not 0) with the watcher subscription still non-empty.
  it("returnToHand tears down the bounced source's subTrigger replacements + watchers (WR-01)", async () => {
    const h = harness({ turnSeat: 0, board: { 0: { battleArea: [battleDigimon("source", 3000)] } } });
    const source = h.s.perm("source");
    const sourceId = source.permanentId;

    h.subTriggers.subscribeReplacement({
      event: "wouldDigivolve",
      sourcePermanentId: sourceId,
      mode: "reduceCost",
      amount: 2,
      description: "test: stale digivolve-cost reduction from a bounced source",
    });
    h.subTriggers.subscribe({
      event: "onDeletionOf",
      sourcePermanentId: sourceId,
      once: false,
      run: async () => {},
      description: "test: stale onDeletionOf watcher from a bounced source",
    });
    // Sanity: live BEFORE the bounce (so the post-bounce assertion measures a real drop).
    expect(h.subTriggers.costReductionFor("wouldDigivolve", sourceId)).toBe(2);

    const moved = await h.fx.returnToHand([source.topCard.instanceId]);
    expect(moved).toHaveLength(1); // whole permanent bounced to hand
    expect(h.state.players[0]!.battleArea).toHaveLength(0); // left the field

    // The bounced source left the field, so its three ledgers were torn down together.
    expect(h.subTriggers.costReductionFor("wouldDigivolve", sourceId)).toBe(0);
    expect(h.subTriggers.subscriptionsFor("onDeletionOf", sourceId)).toHaveLength(0);
  });
});

describe("primitives: dnaDigivolveInto", () => {
  it("consumes two materials and plays the result carrying their cards beneath", async () => {
    const h = harness({
      board: {
        // AD1-001, DP 5000 in hand
        0: {
          battleArea: [battleDigimon("a", 4000), battleDigimon("b", 3000)],
          hand: [{ card: DIGIMON, as: "result" }],
        },
      },
    });
    const a = h.s.perm("a");
    const b = h.s.perm("b");
    const aTop = a.topCard.instanceId;
    const bTop = b.topCard.instanceId;
    const resultId = h.s.inst("result").instanceId;

    const perm = await h.fx.dnaDigivolveInto([a.permanentId, b.permanentId], resultId);
    expect(perm).toBeDefined();
    expect(perm!.topCard.instanceId).toBe(resultId);
    expect(perm!.baseDP).toBe(5000);
    // both materials gone from the field, replaced by the single new permanent
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    const stackIds = perm!.stack.map((c) => c.instanceId);
    expect(stackIds).toContain(aTop);
    expect(stackIds).toContain(bTop);
  });

  it("returns undefined with fewer than two materials", async () => {
    const h = harness({
      board: { 0: { battleArea: [battleDigimon("a", 4000)], hand: [{ card: DIGIMON, as: "result" }] } },
    });
    const perm = await h.fx.dnaDigivolveInto([h.s.perm("a").permanentId], h.s.inst("result").instanceId);
    expect(perm).toBeUndefined();
  });

  // CR 8-2-2-1-2: "If a card that would become a digivolution card has a link card, the
  // link card is trashed immediately before placing the card as a digivolution card."
  // A material's linked card must land in its owner's trash, NOT vanish, and must NOT
  // ride along into the DNA result's new digivolution stack.
  it("trashes each material's linked cards instead of dropping them (CR 8-2-2-1-2)", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            { card: DIGIMON, as: "a", dp: 4000, linked: [{ card: OPTION, as: "aLinked" }] },
            { card: DIGIMON, as: "b", dp: 3000, linked: [{ card: OPTION, as: "bLinked" }] },
          ],
          hand: [{ card: DIGIMON, as: "result" }],
        },
      },
    });
    const aLinkedId = h.s.inst("aLinked").instanceId;
    const bLinkedId = h.s.inst("bLinked").instanceId;

    const perm = await h.fx.dnaDigivolveInto(
      [h.s.perm("a").permanentId, h.s.perm("b").permanentId],
      h.s.inst("result").instanceId,
    );
    expect(perm).toBeDefined();
    // Not vanished: both linked cards are accounted for in the owner's trash.
    const trashIds = h.state.players[0]!.trash.map((c) => c.instanceId);
    expect(trashIds).toContain(aLinkedId);
    expect(trashIds).toContain(bLinkedId);
    // Not carried into the new permanent's stack or its (fresh, empty) linked list.
    const stackIds = perm!.stack.map((c) => c.instanceId);
    expect(stackIds).not.toContain(aLinkedId);
    expect(stackIds).not.toContain(bLinkedId);
    expect(perm!.linked).toHaveLength(0);
  });

  // CR 8-2-2-1-1: "The card placed on top digivolves unsuspended without carrying over the
  // orientation from before the digivolution." A DNA-digivolved result must enter unsuspended
  // regardless of whether either material was suspended.
  it("enters unsuspended even when both materials were suspended (CR 8-2-2-1-1)", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [
            { card: DIGIMON, as: "a", dp: 4000, suspended: true },
            { card: DIGIMON, as: "b", dp: 3000, suspended: true },
          ],
          hand: [{ card: DIGIMON, as: "result" }],
        },
      },
    });

    const perm = await h.fx.dnaDigivolveInto(
      [h.s.perm("a").permanentId, h.s.perm("b").permanentId],
      h.s.inst("result").instanceId,
    );
    expect(perm).toBeDefined();
    expect(perm!.isSuspended).toBe(false);
  });
});

// ENG-03 / WR-03: an effect-driven digivolve (digivolveFromInstance) and a DNA digivolve
// (dnaDigivolveInto) that pay cost must fold the printed digivolve cost through the
// continuous evo-cost ledger (ModifierLedger.evoCostFor + the wouldDigivolve replacement
// reduction), exactly like the normal player-action path (GameEngine.adjustedDigivolveCost),
// so continuous cost-reductions apply to them too (KB BT1-109 Q980).
//
// These are FAILS-WHEN-REVERTED A3 cases: they drive the REAL primitive intent (payCost:true)
// and read the PAID cost off the live memory gauge (h.state.memory) — NOT a hand-built
// evoCostFor query (the Pitfall-3 trap that masked the 09-03 inert bug). Reverting Task 1's
// routing makes the branch pay the FULL printed cost, so the asserted exact gauge delta
// (reduced cost) goes RED. The exact-delta assertion also catches a doubled reduction
// (over-shoot -> RED), guarding the no-double-count invariant.
//
// Card pair: the harness DIGIMON top is AD1-001 (Red, Level 4). AD1-002 (Red, Level 5)
// lists an EvoCost "Red, Level 4 -> memoryCost 3", so matchingDigivolveCost(AD1-002, AD1-001)
// is 3 (a nonzero printed cost). A -1 continuous reduction yields a reduced paid cost of 2.
describe("primitives: effect-driven digivolve cost honors the continuous evo-cost ledger (ENG-03 / WR-03)", () => {
  const INTO = "AD1-002"; // Red Lv.5, evolves from Red Lv.4 (AD1-001) for memoryCost 3
  const PRINTED_COST = 3;
  const REDUCTION = 1; // continuous -1 reduction -> reduced cost 2 (> 0, so the delta is observable)
  const REDUCED_COST = PRINTED_COST - REDUCTION;

  it.each([
    [4, -1, 0, 3],
    [1, -2, 0, 0],
    [0, 1, 0, 1],
    [1, 1, -2, 0],
  ])(
    "sets the requirement to %s, applies delta %s, and floors the payment",
    async (fixed, delta, ledgerDelta, paid) => {
      const h = harness({
        turnSeat: 0,
        memory: 5,
        board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: INTO, as: "evolving" }] } },
      });
      const base = h.s.perm("p1");
      h.ledger.addEvoCostAdjustment((match) => match.target.permanentId === base.permanentId, fixed, true, {
        continuous: true,
      });
      h.ledger.addEvoCostAdjustment((match) => match.target.permanentId === base.permanentId, ledgerDelta, false, {
        continuous: true,
      });
      const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("evolving").instanceId, {
        payCost: true,
        costDelta: delta,
      });
      expect(result).toBeDefined();
      expect(h.state.memory).toBe(5 - paid);
    },
  );

  it("effect-driven digivolveFromInstance pays the REDUCED cost off the memory gauge", async () => {
    const h = harness({
      turnSeat: 0,
      memory: 5,
      // p1's top is AD1-001 (Red Lv.4)
      board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: INTO, as: "evolving" }] } },
    });
    const base = h.s.perm("p1");
    const evolvingId = h.s.inst("evolving").instanceId;

    // Continuous evo-cost reduction keyed to the base permanent being digivolved.
    h.ledger.addEvoCostAdjustment((m) => m.target.permanentId === base.permanentId, -REDUCTION, false, {
      continuous: true,
    });

    const before = h.state.memory;
    const result = await h.fx.digivolveFromInstance(base.permanentId, evolvingId, { payCost: true });

    expect(result).toBeDefined();
    expect(base.topCard.instanceId).toBe(evolvingId); // the digivolve happened
    // The turn player's gauge drops by exactly the PAID cost. With the ledger fold the paid
    // cost is the REDUCED cost (2), not the full printed cost (3). FAILS-WHEN-REVERTED:
    // reverting Task 1's routing pays the full printed cost -> delta is 3 -> this goes RED.
    expect(before - h.state.memory).toBe(REDUCED_COST);
  });

  it("pays the printed cost when effect-driven digivolution reductions are blocked", async () => {
    const h = harness({
      turnSeat: 0,
      memory: 5,
      board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: INTO, as: "evolving" }] } },
    });
    const base = h.s.perm("p1");
    h.continuous.addCostReductionBlock(0, "digivolve", EffectDuration.Permanent);
    h.ledger.addEvoCostAdjustment((m) => m.target.permanentId === base.permanentId, -REDUCTION, false, {
      continuous: true,
    });

    const before = h.state.memory;
    const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("evolving").instanceId, {
      payCost: true,
      costDelta: -1,
    });

    expect(result).toBeDefined();
    expect(before - h.state.memory).toBe(PRINTED_COST);
  });

  // The DNA path prices off a matching DNA requirement only — there is no ordinary-digivolve
  // fallback — so this case needs a nonzero DNA cost. Every printed DNA recipe costs 0, so the
  // test installs a synthetic cost-4 requirement for BT13-059 and restores the real one after.
  const DNA_INTO = "BT13-059";
  const DNA_PRINTED_COST = 4;
  const DNA_REDUCED_COST = DNA_PRINTED_COST - REDUCTION;

  it("DNA dnaDigivolveInto pays the REDUCED cost off the memory gauge", async () => {
    DNA_DIGIVOLUTION_REQUIREMENT_OVERRIDES[DNA_INTO] = [
      { cost: DNA_PRINTED_COST, materials: [{ namesExact: ["Slayerdramon"] }, { namesExact: ["Breakdramon"] }] },
    ];
    onTestFinished(() => {
      delete DNA_DIGIVOLUTION_REQUIREMENT_OVERRIDES[DNA_INTO];
    });
    const h = harness({
      turnSeat: 0,
      memory: 5,
      board: {
        0: {
          battleArea: [
            { card: "EX3-024", as: "a", dp: 4000 },
            { card: "EX3-044", as: "b", dp: 3000 },
          ],
          hand: [{ card: DNA_INTO, as: "result" }],
        },
      },
    });
    const a = h.s.perm("a");
    const b = h.s.perm("b");
    const resultId = h.s.inst("result").instanceId;

    // Continuous reduction keyed to the material the DNA path charges against (the first).
    h.ledger.addEvoCostAdjustment((m) => m.target.permanentId === a.permanentId, -REDUCTION, false, {
      continuous: true,
    });

    const before = h.state.memory;
    const perm = await h.fx.dnaDigivolveInto([a.permanentId, b.permanentId], resultId, { payCost: true });

    expect(perm).toBeDefined();
    expect(perm!.topCard.instanceId).toBe(resultId);
    // FAILS-WHEN-REVERTED: reverting Task 1's DNA routing pays the full printed cost (4) -> RED.
    expect(before - h.state.memory).toBe(DNA_REDUCED_COST);
  });
});

describe("primitives: recoverToSecurity", () => {
  it("moves the top N deck cards onto the top of the security stack, face-down", async () => {
    const h = harness({
      board: {
        0: {
          deck: [
            { card: DIGIMON, as: "top" },
            { card: TAMER, as: "second" },
          ],
          security: [OPTION], // existing security
        },
      },
    });
    const topId = h.s.inst("top").instanceId;

    const moved = await h.fx.recoverToSecurity(0, 1);
    expect(moved.map((c) => c.instanceId)).toEqual([topId]);
    expect(h.state.players[0]!.security[0]!.instanceId).toBe(topId); // new top
    expect(h.state.players[0]!.security[0]!.faceUp).toBe(false);
    expect(h.state.players[0]!.deck).toHaveLength(1);
    expect(h.events).toContainEqual({ kind: "securityRecovered", seat: 0, amount: 1 });
  });

  it("can raise security above 5 when the card effect has no printed ceiling", async () => {
    const h = harness({
      board: { 0: { security: 4, deck: [DIGIMON, TAMER, OPTION] } },
    });
    const moved = await h.fx.recoverToSecurity(0, 3);
    expect(moved).toHaveLength(3);
    expect(h.state.players[0]!.security).toHaveLength(7);
    expect(h.state.players[0]!.deck).toHaveLength(0);
  });

  it("still recovers at 5 security when the printed effect permits it", async () => {
    const h = harness({ board: { 0: { security: 5, deck: [DIGIMON] } } });
    const moved = await h.fx.recoverToSecurity(0, 1);
    expect(moved).toHaveLength(1);
    expect(h.state.players[0]!.security).toHaveLength(6);
    expect(h.state.players[0]!.deck).toHaveLength(0);
  });
});

describe("primitives: shuffleSecurity re-hides face-up cards", () => {
  it("uses the match's seeded per-seat stream rather than process randomness", () => {
    const expectedRng = makeRng(73);
    const security = [DIGIMON, TAMER, OPTION, "BT1-001"];
    const expected = shuffleInPlace([...security], expectedRng);
    const actualRng = makeRng(73);
    const h = harness({
      board: { 0: { security } },
      rngForSeat: () => actualRng,
    });

    h.fx.shuffleSecurity(0);

    expect(h.state.players[0]!.security.map((card) => card.cardId)).toEqual(expected);
    expect(Array.from({ length: 5 }, () => actualRng())).toEqual(Array.from({ length: 5 }, () => expectedRng()));
  });

  it("publishes one chosen card identity without revealing any surrounding private cards", () => {
    const h = harness();

    h.fx.revealCard(0, "BT1-045", "EX3-029");

    expect(h.events).toContainEqual({
      kind: "cardRevealed",
      seat: 0,
      cardId: "BT1-045",
      sourceCardId: "EX3-029",
    });
  });

  it("keeps every shuffled card attached so a reconnect's full sync can encode it", () => {
    const rng = makeRng(4228219432);
    const h = harness({ board: { 0: { security: 5 } }, rngForSeat: () => rng });
    const security = h.state.players[0]!.security;
    const encoder = new Encoder(h.state);
    encoder.encodeAll();
    encoder.discardChanges();

    for (let shuffle = 0; shuffle < 20; shuffle++) {
      h.fx.shuffleSecurity(0);
      encoder.encode();
      encoder.discardChanges();
    }

    for (const card of security) {
      expect(card[$changes]?.root).toBeDefined();
      expect(card.digivolveRoutes[$changes]?.parent).toBe(card);
    }
    const view = new StateView();
    view.add(h.state.players[0]!, PRIVATE_VIEW_TAG);
    for (const card of security) view.add(card);
    const iterator = { offset: 0 };
    const sharedOffset = encoder.encodeAll(iterator).length;
    expect(() => encoder.encodeAllView(view, sharedOffset, iterator)).not.toThrow();
  });

  it("resets faceUp to false on every security card (EX11-064 Q5929-5931)", () => {
    // a previously flipped face-up card, plus a face-down one
    const h = harness({ board: { 0: { security: [{ card: DIGIMON, faceUp: true }, OPTION] } } });
    h.fx.shuffleSecurity(0);
    expect(h.state.players[0]!.security.every((c) => c.faceUp === false)).toBe(true);
  });
});

describe("primitives: changeEvoCost / grantPierce record into the ledger", () => {
  it("changeEvoCost records an adjustment readable for matching permanents", () => {
    const h = harness({ board: { 0: { battleArea: [{ card: DIGIMON, as: "x" }] } } });
    h.fx.changeEvoCost(({ target }) => target.controllerSeat === 0, -1, { setFixed: false });
    expect(h.ledger.evoCostFor(h.s.perm("x"))).toEqual({ delta: -1 });
  });

  it("grantPierce records a pierce grant on the permanent", () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("p1", 5000)] } } });
    const id = h.s.perm("p1").permanentId;
    h.fx.grantPierce(id, EffectDuration.UntilEndBattle);
    expect(h.ledger.hasPierce(id)).toBe(true);
  });
});

describe("primitives: redirectAttack (chooser / optional)", () => {
  // A harness with a combat-port fake recording redirectTarget calls and a scripted prompt.
  // The board comes from the Test Seam; the combat port is the fake under observation.
  function combatHarness(opts: {
    isAttacking: boolean;
    attackerId?: string;
    board?: BoardSpec;
    rejectRedirect?: boolean;
  }) {
    const s = setupEngine(opts.board);
    const state = s.state;
    state.turnSeat = 0;
    const events: ServerEvent[] = [];
    const memory = new MemoryGauge(state, (e) => events.push(e));
    const redirects: { permanentId: string }[] = [];
    let redirectedToPlayer = false;
    const resolvedAttacks: string[] = [];
    const prompts: { seat: Seat; min: number; max: number }[] = [];
    /** The scripted answer to the redirect prompt; unset = take the candidates. */
    let scriptedPick: string[] | undefined;
    const ask: SelectionPort = {
      selectInstances: async (seat, candidates, min, max) => {
        prompts.push({ seat, min, max });
        return scriptedPick ?? candidates.slice(0, max);
      },
    };
    const combat = {
      isAttacking: opts.isAttacking,
      currentAttackerId: opts.attackerId,
      resolveAttack: async (_seat: Seat, attacker: Permanent) => {
        resolvedAttacks.push(attacker.permanentId);
      },
      redirectTarget: (t: { kind: string; permanentId?: string }) => {
        if (opts.rejectRedirect) return false;
        if (t.kind === "permanent" && t.permanentId) redirects.push({ permanentId: t.permanentId });
        if (t.kind === "player") redirectedToPlayer = true;
        return true;
      },
      endAttack: () => true,
      runEvadeDecision: async () => false,
      runBarrierDecision: async () => false,
    };
    const fires: { event: string; payload: unknown }[] = [];
    const engine: PrimitivesEngine = {
      state,
      emit: (e) => events.push(e),
      nextPermanentId: () => "perm-x",
      memory,
      modifiers: new ModifierLedger(),
      ask,
      combat,
      controllerSeat: () => state.turnSeat,
      fireSubTrigger: async (event, payload) => {
        fires.push({ event, payload });
      },
    };
    return {
      s,
      state,
      fx: createPrimitives(engine),
      redirects,
      get redirectedToPlayer() {
        return redirectedToPlayer;
      },
      resolvedAttacks,
      prompts,
      fires,
      setPick(ids: string[]) {
        scriptedPick = ids;
      },
    };
  }

  it("Q3400 does not nest a second forced attack while the first attack is resolving", async () => {
    const h = combatHarness({
      isAttacking: true,
      board: { 0: { battleArea: [battleDigimon("ATTACKER", 5000)] } },
    });

    await h.fx.forceAttack(h.s.perm("ATTACKER").permanentId);

    expect(h.prompts).toHaveLength(0);
    expect(h.resolvedAttacks).toHaveLength(0);
  });

  it("prompts the OPPONENT (defending) seat and redirects to the chosen Digimon", async () => {
    const h = combatHarness({
      isAttacking: true,
      board: { 1: { battleArea: [battleDigimon("DEF1", 5000), battleDigimon("DEF2", 3000)] } },
    });
    const def1 = h.s.perm("DEF1").permanentId;
    const def2 = h.s.perm("DEF2").permanentId;
    h.setPick([def1]);
    await h.fx.redirectAttack([def1, def2], { chooserSeat: 1 as Seat, optional: true });
    // The defending (opponent) seat is prompted, and may decline (min 0).
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0]!.seat).toBe(1);
    expect(h.prompts[0]!.min).toBe(0);
    expect(h.redirects).toEqual([{ permanentId: def1 }]);
  });

  it("when the (optional) chooser declines, the attack proceeds unchanged (no redirect)", async () => {
    const h = combatHarness({ isAttacking: true, board: { 1: { battleArea: [battleDigimon("DEF1", 5000)] } } });
    h.setPick([]); // empty pick = decline
    await h.fx.redirectAttack([h.s.perm("DEF1").permanentId], { chooserSeat: 1 as Seat, optional: true });
    expect(h.redirects).toHaveLength(0); // no target switch
  });

  it("accepts the reserved player candidate and redirects the attack to the opponent", async () => {
    const h = combatHarness({ isAttacking: true, board: { 1: { battleArea: [] } } });
    h.setPick(["player"]);
    await h.fx.redirectAttack(["player"], { chooserSeat: 1 as Seat });
    expect(h.redirectedToPlayer).toBe(true);
  });

  it("defaults to the controller seat and is mandatory when no opts are given", async () => {
    const h = combatHarness({
      isAttacking: true,
      board: { 1: { battleArea: [battleDigimon("C1", 5000), battleDigimon("C2", 5000)] } },
    });
    await h.fx.redirectAttack([h.s.perm("C1").permanentId, h.s.perm("C2").permanentId]);
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0]!.seat).toBe(0); // controllerSeat (turnSeat 0)
    expect(h.prompts[0]!.min).toBe(1); // mandatory
  });

  // A switched target notifies reactive watchers ("when this Digimon's attack target is
  // switched", BT11-008). The attacker is the event subject so a watcher's sourceFilter
  // isSelfRef gates it to its own attack.
  // FAILS-WHEN-REVERTED: removing the fireSubTrigger call after redirectTarget leaves `fires` empty.
  it("fires whenAttackTargetSwitched with the attacker as subject after a successful redirect", async () => {
    const h = combatHarness({
      isAttacking: true,
      attackerId: "ATK1",
      board: { 1: { battleArea: [battleDigimon("DEF1", 5000)] } },
    });
    const def1 = h.s.perm("DEF1").permanentId;
    h.setPick([def1]);
    await h.fx.redirectAttack([def1], { chooserSeat: 1 as Seat });
    expect(h.redirects).toEqual([{ permanentId: def1 }]);
    expect(h.fires).toEqual([
      {
        event: "whenAttackTargetSwitched",
        payload: { subjectPermanentId: "ATK1", attackerPermanentId: "ATK1" },
      },
    ]);
  });

  it("does not announce a target switch when combat rejects the redirect", async () => {
    const h = combatHarness({
      isAttacking: true,
      attackerId: "ATK1",
      rejectRedirect: true,
      board: { 1: { battleArea: [battleDigimon("DEF1", 5000)] } },
    });
    await h.fx.redirectAttack([h.s.perm("DEF1").permanentId], { chooserSeat: 1 as Seat });
    expect(h.redirects).toEqual([]);
    expect(h.fires).toEqual([]);
  });

  it("does NOT fire whenAttackTargetSwitched when the (optional) redirect is declined", async () => {
    const h = combatHarness({
      isAttacking: true,
      attackerId: "ATK1",
      board: { 1: { battleArea: [battleDigimon("DEF1", 5000)] } },
    });
    h.setPick([]); // decline
    await h.fx.redirectAttack([h.s.perm("DEF1").permanentId], { chooserSeat: 1 as Seat, optional: true });
    expect(h.redirects).toHaveLength(0);
    expect(h.fires).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// playInstances breeding destination (Phase 13, Plan 01, Task 3)
// ---------------------------------------------------------------------------

describe("primitives: playInstances — breeding destination", () => {
  it("places a Digimon in the empty breeding slot when breeding:true", async () => {
    const h = harness({ board: { 0: { hand: [{ card: DIGIMON, as: "c" }] } } });

    const created = await h.fx.playInstances([h.s.inst("c").instanceId], { breeding: true });

    expect(created).toHaveLength(1);
    expect(created[0]!.inBreeding).toBe(true);
    // Should be in the breeding slot, not battle area
    expect(h.state.players[0]!.breeding).toBe(created[0]);
    expect(h.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("returns [] when the breeding slot is already occupied (single-occupancy)", async () => {
    const h = harness({
      // Pre-occupy breeding with another permanent
      board: { 0: { breeding: { card: DIGIMON, as: "breeder", dp: 3000 }, hand: [{ card: DIGIMON, as: "c" }] } },
    });
    const existing = h.s.perm("breeder");

    const created = await h.fx.playInstances([h.s.inst("c").instanceId], { breeding: true });
    expect(created).toHaveLength(0); // no-op, slot full
    expect(h.state.players[0]!.breeding).toBe(existing); // unchanged
  });

  it("skips a non-Digimon/non-DigiEgg card when breeding:true (§6-4)", async () => {
    const h = harness({ board: { 0: { hand: [{ card: TAMER, as: "c" }] } } });

    const created = await h.fx.playInstances([h.s.inst("c").instanceId], { breeding: true });
    expect(created).toHaveLength(0); // Tamer cannot go to breeding
    expect(h.state.players[0]!.breeding).toBeUndefined();
  });

  it("FAILS-WHEN-REVERTED: without breeding, the card lands in battleArea (wrong destination)", async () => {
    const h = harness({ board: { 0: { hand: [{ card: DIGIMON, as: "c" }] } } });

    // Standard playWithoutCost (no breeding flag)
    const created = await h.fx.playInstances([h.s.inst("c").instanceId]);

    expect(created).toHaveLength(1);
    // The A3 assertion: without breeding, the card goes to BATTLE area
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(created[0]!.inBreeding).toBe(false);
    expect(h.state.players[0]!.breeding).toBeUndefined();
  });
});

// -------------------------------------------------------------------
// DigiXrosMaterialZoneExpansion (BT19-079/BT19-087, Plan 13-04)
// -------------------------------------------------------------------

describe("expandDigiXrosZones", () => {
  it("records per-seat zone expansion and returns it via digiXrosExpandedZones", () => {
    const h = harness();
    expect(h.fx.digiXrosExpandedZones).toBeDefined();
    expect(h.fx.expandDigiXrosZones).toBeDefined();

    // Initially no expansion
    expect(h.fx.digiXrosExpandedZones!(0)).toEqual([]);

    // Expand for seat 0 with digivolutionCards zone
    h.fx.expandDigiXrosZones!(0, ["digivolutionCards"], "Permanent" as never);
    expect(h.fx.digiXrosExpandedZones!(0)).toEqual(["digivolutionCards"]);
  });

  it("different seats have independent expansions", () => {
    const h = harness();
    h.fx.expandDigiXrosZones!(0, ["digivolutionCards"], "Permanent" as never);
    h.fx.expandDigiXrosZones!(1, ["trash"], "Permanent" as never);

    expect(h.fx.digiXrosExpandedZones!(0)).toEqual(["digivolutionCards"]);
    expect(h.fx.digiXrosExpandedZones!(1)).toEqual(["trash"]);
  });

  it("FAILS-WHEN-REVERTED: without expansion call, zones return empty (no extra sources)", () => {
    const h = harness();
    // A3 gate: prove that without the expand call, expanded zones are empty.
    // Removing the expansion code means the DigiXros material-picking path
    // would only use default zones — wrong for BT19-079/BT19-087.
    expect(h.fx.digiXrosExpandedZones!(0)).toEqual([]);
  });

  it("scopes per-play expansions and cleanup to the pending play instance", () => {
    const h = harness();
    h.fx.expandDigiXrosZonesForPlay!(0, ["trash"], "Permanent" as never, "play-a");
    h.fx.expandDigiXrosZonesForPlay!(0, ["underTamers"], "Permanent" as never, "play-b");

    expect(h.fx.digiXrosExpandedZoneCounts!(0, "play-a")).toEqual({ trash: 1 });
    expect(h.fx.digiXrosExpandedZoneCounts!(0, "play-b")).toEqual({ underTamers: 1 });
    expect(h.fx.digiXrosPlayExpansionCount!(0, "play-a")).toBe(1);

    h.fx.consumeDigiXrosPlayExpansions!(0, "play-a");
    expect(h.fx.digiXrosExpandedZoneCounts!(0, "play-a")).toEqual({});
    expect(h.fx.digiXrosExpandedZoneCounts!(0, "play-b")).toEqual({ underTamers: 1 });
  });
});

describe("grantKind + effectiveKinds + payActivationCost (HARD-05)", () => {
  // FAILS-WHEN-REVERTED: stub grantKind to no-op — grantedKinds returns empty,
  // proving the grant is causal (the Tamer stays a pure Tamer, not a Digimon).
  it("grantKind delegates to ContinuousEffectLedger.addKindGrant and is queryable via grantedKinds", () => {
    const h = harness();
    const pid = "perm-tamer-1";
    h.fx.grantKind!(pid, [CardKind.Digimon], EffectDuration.UntilEachTurnEnd);
    expect(h.continuous.grantedKinds(pid)).toEqual([CardKind.Digimon]);
  });

  it("effectiveKinds returns static kinds ∪ granted kinds via GameAccess", () => {
    const h = harness();
    const pid = "perm-tamer-1";
    h.fx.grantKind!(pid, [CardKind.Digimon], EffectDuration.UntilEachTurnEnd);
    // Build a minimal GameAccess — the primitives don't expose it directly,
    // so test through the continuous ledger directly (which effectiveKinds uses)
    const result = effectiveKinds(h.continuous, pid, [CardKind.Tamer]);
    expect(result).toContain(CardKind.Tamer);
    expect(result).toContain(CardKind.Digimon);
  });

  it("payActivationCost suspends an unsuspended battle-area permanent and returns true", () => {
    // FAILS-WHEN-REVERTED: stub payActivationCost to always return false (no-op).
    // The permanent stays unsuspended — the reduction is causal, not coincidental.
    const h = harness({ board: { 0: { battleArea: [battleDigimon("perm-digi-1", 5000)] } } });
    const p = h.s.perm("perm-digi-1");
    const result = h.fx.payActivationCost!(p.permanentId, "suspend");
    expect(result).toBe(true);
    expect(p.isSuspended).toBe(true);
  });

  it("payActivationCost returns false for an already-suspended permanent", () => {
    const h = harness({
      board: { 0: { battleArea: [{ card: DIGIMON, as: "perm-digi-2", dp: 5000, suspended: true }] } },
    });
    const p = h.s.perm("perm-digi-2");
    const result = h.fx.payActivationCost!(p.permanentId, "suspend");
    expect(result).toBe(false);
    expect(p.isSuspended).toBe(true);
  });

  it("payActivationCost returns false for a non-existent permanentId", () => {
    const h = harness();
    const result = h.fx.payActivationCost!("nonexistent", "suspend");
    expect(result).toBe(false);
  });

  it("payActivationCost returns false for a breeding-area permanent", () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("perm-digi-3", 5000)] } } });
    const p = h.s.perm("perm-digi-3");
    p.inBreeding = true;
    const result = h.fx.payActivationCost!(p.permanentId, "suspend");
    expect(result).toBe(false);
    expect(p.isSuspended).toBe(false);
  });

  it("payActivationCost returns false for a permanent with beAffected restriction", () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("perm-digi-4", 5000)] } } });
    const p = h.s.perm("perm-digi-4");
    h.continuous.addRestriction(p.permanentId, "beAffected", EffectDuration.UntilEachTurnEnd);
    const result = h.fx.payActivationCost!(p.permanentId, "suspend");
    expect(result).toBe(false);
    expect(p.isSuspended).toBe(false);
  });

  it("payActivationCost returns false for a permanent that can't be suspended", () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("perm-digi-cant-suspend", 5000)] } } });
    const p = h.s.perm("perm-digi-cant-suspend");
    h.continuous.addRestriction(p.permanentId, "beSuspended", EffectDuration.UntilEachTurnEnd);

    expect(h.fx.payActivationCost!(p.permanentId, "suspend")).toBe(false);
    expect(p.isSuspended).toBe(false);
  });
});

// Bucket-3: effect-driven digivolves of the form "for a digivolution cost of N[, ignoring its
// digivolution requirements]" (documented behavior DigivolveIntoHandOrTrashCard fixedCostTuple /
// ignoreDigivolutionRequirementFixedCost). costOverride replaces the printed cost; ignoreRequirements
// waives the printed color+level gate. The harness top is AD1-001 (Red Lv.4).
describe("primitives: digivolveFromInstance costOverride + ignoreRequirements", () => {
  const LV6 = "BT17-017"; // AncientGreymon, Lv.6, EvoCost Red/Purple Lv.5 — a Lv.4 base cannot meet it
  const LV5 = "AD1-002"; // Red Lv.5, EvoCost Red Lv.4 — a Lv.4 base CAN meet it (printed cost 3)

  it("keeps the destination's printed cost when requirements are ignored, then applies costDelta", async () => {
    const h = harness({
      turnSeat: 0,
      memory: 5,
      board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: LV5, as: "evolving" }] } },
    });
    const base = h.s.perm("p1");

    const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("evolving").instanceId, {
      payCost: true,
      costDelta: -1,
      ignoreRequirements: true,
    });

    expect(result).toBeDefined();
    expect(h.state.memory).toBe(3); // printed cost 3, reduced by 1
  });

  it("ignoreRequirements lets an off-level base digivolve, paying exactly the costOverride", async () => {
    const h = harness({
      turnSeat: 0,
      memory: 5,
      // p1's top is AD1-001 (Red Lv.4); LV6's requirement is NOT met by a Lv.4 base
      board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: LV6, as: "evolving" }] } },
    });
    const base = h.s.perm("p1");
    const evolvingId = h.s.inst("evolving").instanceId;

    const before = h.state.memory;
    const result = await h.fx.digivolveFromInstance(base.permanentId, evolvingId, {
      payCost: true,
      costOverride: 2,
      ignoreRequirements: true,
    });
    expect(result).toBeDefined();
    expect(base.topCard.instanceId).toBe(evolvingId);
    expect(before - h.state.memory).toBe(2); // the override, not the printed cost
  });

  it("rejects that same ignoreRequirements request while a cannot-ignore rule is live", async () => {
    const h = harness({
      turnSeat: 0,
      memory: 5,
      board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: LV6, as: "evolving" }] } },
    });
    const base = h.s.perm("p1");
    const evolvingId = h.s.inst("evolving").instanceId;
    h.continuous.addCannotIgnoreDigivolution(0, EffectDuration.UntilEachTurnEnd);

    const result = await h.fx.digivolveFromInstance(base.permanentId, evolvingId, {
      payCost: true,
      costOverride: 2,
      ignoreRequirements: true,
    });

    expect(result).toBeUndefined();
    expect(base.topCard.cardId).toBe("AD1-001");
    expect(h.state.players[0]!.hand.some(({ instanceId }) => instanceId === evolvingId)).toBe(true);
    expect(h.state.memory).toBe(5);
  });

  it("costOverride WITHOUT ignoreRequirements still enforces the printed requirement", async () => {
    const h = harness({
      turnSeat: 0,
      memory: 5,
      // p1's top is AD1-001 (Red Lv.4); LV6's requirement is unmet by a Lv.4 base
      board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: LV6, as: "evolving" }] } },
    });
    const base = h.s.perm("p1");

    const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("evolving").instanceId, {
      payCost: true,
      costOverride: 2,
    });
    expect(result).toBeUndefined(); // gate holds: no digivolve
    expect(base.topCard.cardId).toBe("AD1-001");
  });

  it("costOverride pays the fixed cost when the requirement IS met (BT7-051 shape)", async () => {
    const h = harness({
      turnSeat: 0,
      memory: 5,
      // p1's top is AD1-001 (Red Lv.4); LV5's requirement is met (printed cost 3)
      board: { 0: { battleArea: [battleDigimon("p1", 4000)], hand: [{ card: LV5, as: "evolving" }] } },
    });
    const base = h.s.perm("p1");

    const before = h.state.memory;
    const result = await h.fx.digivolveFromInstance(base.permanentId, h.s.inst("evolving").instanceId, {
      payCost: true,
      costOverride: 1, // overrides the printed 3
    });
    expect(result).toBeDefined();
    expect(before - h.state.memory).toBe(1);
  });
});

describe("primitives: suspend (whenEffectSuspends fire seam)", () => {
  // BT14-004 reacts to "when one of your effects suspends a Tamer". The effect-driven suspend
  // primitive (distinct from combat suspension, which calls access.suspend directly) is the
  // single seam that fires whenEffectSuspends, carrying the suspended permanent as subject and
  // the acting effect's seat so the watcher can require it was its OWN controller's.
  // FAILS-WHEN-REVERTED: dropping the whenEffectSuspends fire leaves it out of subTriggerFires.
  it("fires whenEffectSuspends with the suspended permanent + acting seat", async () => {
    const h = harness({ turnSeat: 0, board: { 1: { battleArea: [battleDigimon("TAMER1", 0)] } } });
    const tamerId = h.s.perm("TAMER1").permanentId;
    await h.fx.suspend([tamerId], { byEffectSeat: 0 });
    expect(h.subTriggerFires).toContainEqual({
      event: "whenEffectSuspends",
      payload: { subjectPermanentId: tamerId, suspendedPermanentId: tamerId, effectSuspendSeat: 0 },
    });
    // The pre-existing whenSuspended fire is preserved alongside it.
    expect(h.subTriggerFires).toContainEqual({
      event: "whenSuspended",
      payload: { subjectPermanentId: tamerId, suspendedPermanentId: tamerId, effectSuspendSeat: 0 },
    });
  });

  it("does NOT fire whenEffectSuspends when the permanent is already suspended (no transition)", async () => {
    const h = harness({
      turnSeat: 0,
      board: { 1: { battleArea: [{ card: DIGIMON, as: "TAMER1", dp: 0, suspended: true }] } },
    });
    const suspended = await h.fx.suspend([h.s.perm("TAMER1").permanentId], { byEffectSeat: 0 });
    expect(suspended).toEqual([]);
    expect(h.subTriggerFires.some((f) => f.event === "whenEffectSuspends")).toBe(false);
  });

  it("reports only permanents that actually transitioned to suspended", async () => {
    const h = harness({
      board: {
        0: {
          battleArea: [battleDigimon("fresh", 5000), { card: DIGIMON, as: "already", dp: 5000, suspended: true }],
        },
      },
    });
    const freshId = h.s.perm("fresh").permanentId;
    const alreadyId = h.s.perm("already").permanentId;

    expect(await h.fx.suspend([freshId, alreadyId])).toEqual([freshId]);
  });

  it("omits effectSuspendSeat when no acting seat is supplied (engine-internal suspend)", async () => {
    const h = harness({ turnSeat: 0, board: { 1: { battleArea: [battleDigimon("TAMER1", 0)] } } });
    const tamerId = h.s.perm("TAMER1").permanentId;
    await h.fx.suspend([tamerId]);
    expect(h.subTriggerFires).toContainEqual({
      event: "whenEffectSuspends",
      payload: { subjectPermanentId: tamerId, suspendedPermanentId: tamerId },
    });
    expect(h.subTriggerFires).toContainEqual({
      event: "whenSuspended",
      payload: { subjectPermanentId: tamerId, suspendedPermanentId: tamerId },
    });
  });
});

describe("primitives: deDigivolve stopAtLevel (can't trash past level N)", () => {
  // Concrete Digimon ids with known levels from the generated card data:
  const L3 = "BT1-009"; // level 3
  const L4 = "AD1-001"; // level 4
  const L5 = "AD1-002"; // level 5
  const L6 = "AD1-004"; // level 6
  const L7 = "AD1-025"; // level 7

  // A stacked Digimon: top is L7; sources (bottom -> directly-beneath-top) are
  // [L3, L4, L5, L6]. deDigivolve pops the LAST stack element first, so the promote order is
  // L6 -> L5 -> L4 -> L3.
  function stacked(alias: string): PermanentSpec {
    return {
      card: L7,
      as: alias,
      dp: 7000,
      under: [
        { card: L3, as: `${alias}-l3` },
        { card: L4, as: `${alias}-l4` },
        { card: L5, as: `${alias}-l5` },
        { card: L6, as: `${alias}-l6` },
      ],
    };
  }

  it("promotes to the floor, then stops before trashing past it (stopAtLevel:3)", async () => {
    const h = harness({ turnSeat: 0, board: { 1: { battleArea: [stacked("P1")] } } });
    const p = h.s.perm("P1");
    const l3Id = h.s.inst("P1-l3").instanceId;
    // De-Digivolve reaches the L3, then the floor prevents any further peel.
    const moved = await h.fx.deDigivolve(p.permanentId, 4, { byEffectSeat: 0, stopAtLevel: 3 });
    expect(moved).toHaveLength(4); // L7, L6, L5, L4 trashed; L3 promoted to top
    expect(p.topCard?.instanceId).toBe(l3Id);
    expect(p.stack).toHaveLength(0);
  });

  it("applies the standard level-3 floor even when no explicit stopAtLevel is encoded", async () => {
    const h = harness({
      turnSeat: 0,
      board: {
        1: {
          battleArea: [
            {
              card: L7,
              as: "P2",
              under: [
                { card: "BT1-001", as: "P2-egg" },
                { card: L3, as: "P2-l3" },
                { card: L4, as: "P2-l4" },
                { card: L5, as: "P2-l5" },
                { card: L6, as: "P2-l6" },
              ],
            },
          ],
        },
      },
    });
    const p = h.s.perm("P2");
    const l3Id = h.s.inst("P2-l3").instanceId;
    const eggId = h.s.inst("P2-egg").instanceId;
    const moved = await h.fx.deDigivolve(p.permanentId, 8, { byEffectSeat: 0 });
    expect(moved).toHaveLength(4);
    expect(p.topCard?.instanceId).toBe(l3Id);
    expect(p.stack.map((card) => card.instanceId)).toEqual([eggId]);
  });
});

describe("primitives: forced-attack target legality", () => {
  it("excludes the player, protected Digimon, and unsuspended Digimon when the effect requires a Digimon target", async () => {
    let resolvedTarget: AttackTarget | undefined;
    const combat: CombatPort = {
      isAttacking: false,
      currentAttackerId: undefined,
      resolveAttack: async (_seat, _attacker, target) => {
        resolvedTarget = target;
      },
      redirectTarget: () => false,
      endAttack: () => false,
      runEvadeDecision: async () => false,
      runBarrierDecision: async () => false,
    };
    const h = harness({
      combat,
      board: {
        0: { battleArea: [{ card: "BT9-055", as: "grandis", suspended: false }] },
        1: {
          battleArea: [
            { card: DIGIMON, as: "protected", suspended: true },
            { card: DIGIMON, as: "legal", suspended: true },
            { card: DIGIMON, as: "unsuspended", suspended: false },
          ],
        },
      },
    });
    h.continuous.addRestriction(h.s.perm("protected").permanentId, "cantBeAttacked", EffectDuration.UntilEachTurnEnd);
    h.selections.push([h.s.perm("legal").permanentId]);

    await h.fx.forceAttack(h.s.perm("grandis").permanentId, { attackTargetScope: AttackTargetScope.DIGIMON.value });

    expect(h.selectionCandidates.at(-1)).toEqual([h.s.perm("legal").permanentId]);
    expect(resolvedTarget).toEqual({ kind: "permanent", permanentId: h.s.perm("legal").permanentId });
  });

  it("ends without opening a target decision when a Digimon-only forced attack has no legal target", async () => {
    let resolvedTarget: AttackTarget | undefined;
    const combat: CombatPort = {
      isAttacking: false,
      currentAttackerId: undefined,
      resolveAttack: async (_seat, _attacker, target) => {
        resolvedTarget = target;
      },
      redirectTarget: () => false,
      endAttack: () => false,
      runEvadeDecision: async () => false,
      runBarrierDecision: async () => false,
    };
    const h = harness({ combat, board: { 0: { battleArea: [{ card: "BT9-055", as: "grandis" }] } } });

    await h.fx.forceAttack(h.s.perm("grandis").permanentId, { attackTargetScope: AttackTargetScope.DIGIMON.value });

    expect(h.selectionCandidates).toHaveLength(0);
    expect(resolvedTarget).toBeUndefined();
  });
});

describe("simultaneous Digi-Egg and permanent placement", () => {
  it.each(["destinationRemoved", "sourceRestricted"])("revalidates %s after leave reactions", async (reaction) => {
    const h = harness({
      turnSeat: 0,
      board: {
        0: {
          breeding: { card: "BT13-007", as: "dest" },
          eggDeck: [{ card: "BT13-007", as: "egg" }],
          battleArea: [{ card: "BT20-060", as: "source" }],
        },
      },
      onConsultLeave: () => {
        if (reaction === "destinationRemoved") setBreeding(h.state.players[0]!, undefined);
        else
          h.continuous.addRestriction(
            h.s.perm("source").permanentId,
            "leaveBattleAreaExceptByDeletion",
            EffectDuration.Permanent,
          );
      },
    });
    const destination = h.s.perm("dest");
    await h.fx.placeEggAndPermanentsUnder!(destination.permanentId, [
      { instanceId: h.s.inst("egg").instanceId },
      { instanceId: h.s.inst("source").instanceId, permanentId: h.s.perm("source").permanentId },
    ]);
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(h.state.players[0]!.eggDeck).toHaveLength(reaction === "destinationRemoved" ? 1 : 0);
    expect(destination.stack.map((c) => c.cardId)).toEqual(reaction === "destinationRemoved" ? [] : ["BT13-007"]);
    expect(h.events).toHaveLength(reaction === "destinationRemoved" ? 0 : 1);
    expect(h.subTriggerFires.some((f) => f.event === "whenLeavesPlay")).toBe(false);
  });

  it("leaves restricted sources in play while placing the egg and other tops in chosen order", async () => {
    const h = harness({
      turnSeat: 0,
      board: {
        0: {
          breeding: { card: "BT13-007", as: "dest" },
          eggDeck: [{ card: "BT13-007", as: "egg" }],
          battleArea: [
            { card: "BT20-060", as: "sourceA", under: [{ card: "BT1-009", as: "shed" }] },
            { card: "BT22-052", as: "sourceB" },
          ],
        },
      },
    });
    h.continuous.addRestriction(
      h.s.perm("sourceB").permanentId,
      "leaveBattleAreaExceptByDeletion",
      EffectDuration.Permanent,
    );
    await h.fx.placeEggAndPermanentsUnder!(h.s.perm("dest").permanentId, [
      { instanceId: h.s.inst("egg").instanceId },
      { instanceId: h.s.inst("sourceA").instanceId, permanentId: h.s.perm("sourceA").permanentId },
      { instanceId: h.s.inst("sourceB").instanceId, permanentId: h.s.perm("sourceB").permanentId },
    ]);
    expect(h.s.perm("dest").stack.map((c) => c.cardId)).toEqual(["BT13-007", "BT20-060"]);
    expect(h.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT22-052"]);
    expect(h.state.players[0]!.trash.map((c) => c.instanceId)).toEqual([h.s.inst("shed").instanceId]);
    expect(h.state.players[0]!.eggDeck).toHaveLength(0);
    expect(h.subTriggerFires.filter((f) => f.event === "onAddDigivolutionCards")).toHaveLength(1);
  });
});

describe("Primitives completeness guard (no declared-but-unassigned methods)", () => {
  // Every key on the Primitives interface (EffectContext.ts), kept exhaustive by the TS
  // compiler: a `Record<keyof Primitives, true>` fails to compile if a key here is missing OR
  // if the interface grows a key this literal doesn't have. So the moment a primitive is
  // declared without being wired into this list, `pnpm typecheck` catches it here -- adding a
  // primitive can no longer silently skip both the implementation AND this guard.
  //
  // This generalizes the `grantCustom` bug this test was written to catch: `grantCustom` was
  // declared as `grantCustom?(...)` on `Primitives`, called from BT7-055 and twice from
  // `interpreter.ts` as `ctx.fx.grantCustom?.(...)`, and never assigned in `createPrimitives`
  // -- so every call compiled fine and did nothing, forever (BT15-033 lost its whole effect
  // to the same shape; see the corresponding regression coverage, "an API that makes
  // silent no-ops easy"). The optional-call idiom hid it from every existing test.
  const ALL_PRIMITIVE_KEYS: Record<keyof Primitives, true> = {
    addColorGrant: true,
    addDeletionMaxDp: true,
    addDpDeleteBudget: true,
    addSecurity: true,
    appFuseInto: true,
    armorPurge: true,
    armSuspendRestrictionSource: true,
    ascendToSecurity: true,
    canDnaDigivolve: true,
    canAffordEffectPlay: true,
    effectiveLooseUseCost: true,
    effectivePlayCost: true,
    cannotIgnoreDigivolution: true,
    canPayActivationCost: true,
    canTrashDigivolutionCard: true,
    canSuspend: true,
    canUnsuspend: true,
    changeEvoCost: true,
    changePlayCost: true,
    conferStackEffects: true,
    stackEffectConferrals: true,
    declareWinner: true,
    deDigivolve: true,
    delayedDeletePlayed: true,
    delayedGainMemory: true,
    deletePermanent: true,
    trashPermanentByRule: true,
    deletionMaxDpBonus: true,
    digivolveFromInstance: true,
    digiXrosExpandedZoneCounts: true,
    digiXrosExpandedZones: true,
    digiXrosPlayExpansionCount: true,
    consumeDigiXrosPlayExpansions: true,
    clearPreparedDigiXrosPlay: true,
    preparedDigiXrosMaterials: true,
    prepareDigiXrosPlay: true,
    prepareDigiXrosPlays: true,
    disableSecurityEffect: true,
    disableSecurityEffectsForSeat: true,
    disableTimingEffect: true,
    disableTimingEffectsForPlayer: true,
    dnaDigivolveInto: true,
    dpDeleteBudgetBonus: true,
    draw: true,
    endAttack: true,
    enterEffectResolution: true,
    expandDigiXrosZones: true,
    expandDigiXrosZonesForPlay: true,
    fireOnDiscardLibrary: true,
    fireOptionUsed: true,
    fireSuspensionTriggers: true,
    fireWhenTrashedFromDeck: true,
    flipSecurityFaceUp: true,
    flipTopSecurity: true,
    flipSecurityFaceDown: true,
    forceAttack: true,
    canForceAttack: true,
    blitzAttack: true,
    forceBattle: true,
    gainMemory: true,
    gainMemoryForSeat: true,
    grantCanAttackUnsuspended: true,
    grantCustom: true,
    grantCustomEffect: true,
    customEffectGrants: true,
    grantDnaLevel: true,
    grantDynamicNames: true,
    grantedKeywords: true,
    grantKeyword: true,
    grantKind: true,
    grantLinkCostReduction: true,
    grantLinkMax: true,
    grantNameTrait: true,
    grantPierce: true,
    grantPlayerKeyword: true,
    grantPlayerCustomEffect: true,
    grantVortexCanAttackPlayers: true,
    hasSuspendRestrictionSource: true,
    hatch: true,
    inHandCost: true,
    isAttackResolving: true,
    isAttackTargetLocked: true,
    isBeAffectedBySourceKind: true,
    isDigivolutionRequirementIgnoreBlocked: true,
    isEffectDigivolveBlocked: true,
    isPlayProhibited: true,
    isTimingEffectDisabled: true,
    isUnaffectableByOpponentEffects: true,
    isUnaffectedByOwnEffects: true,
    leaveEffectResolution: true,
    announceEffect: true,
    announceEffectOption: true,
    announceEffectClauseAdvanced: true,
    link: true,
    linkCostReductionUsed: true,
    materialSave: true,
    markLinkCostReductionUsed: true,
    minDpFloor: true,
    modifyDP: true,
    announceSuppressedDpModifier: true,
    modifyPlayerDP: true,
    modifySecurityDp: true,
    movePermanentZone: true,
    orderDnaMaterials: true,
    payActivationCost: true,
    placeAsTopFromEggDeck: true,
    placeOptionAsPermanent: true,
    placeOwnTopAtStackBottom: true,
    placeUnder: true,
    placePlayMaterialsUnder: true,
    placeUnderFromDeck: true,
    placeUnderFromEggDeck: true,
    playFromHand: true,
    playFromSecurity: true,
    playInstances: true,
    playToken: true,
    projectOnDeletionAtEndOfAttack: true,
    reactivateOnPlay: true,
    recoverToSecurity: true,
    redirectAttack: true,
    redirectDigivolutionTrashHosts: true,
    relocatePermanent: true,
    relocatePermanentByEffect: true,
    relocatePermanentsByEffect: true,
    placeEggAndPermanentsUnder: true,
    placeMixedMaterialsUnder: true,
    resolveCardEffect: true,
    resolvingEffectSourceKinds: true,
    restrict: true,
    restrictAttackTarget: true,
    restrictCostReduction: true,
    restrictDigivolveInto: true,
    restrictMemoryGain: true,
    restrictPlay: true,
    restrictPlayer: true,
    restrictSecurityAddsFromEffect: true,
    restrictUnsuspendedDigivolve: true,
    returnToDeck: true,
    returnStackTopsToDeck: true,
    trashStackTops: true,
    returnToEggDeck: true,
    returnToHand: true,
    reveal: true,
    revealCard: true,
    revokeKeyword: true,
    searchDeck: true,
    seatStackTrashLock: true,
    securityAttackInvert: true,
    securityToHand: true,
    setBaseDP: true,
    setMemory: true,
    setMemoryForSeat: true,
    setOriginalCardInfo: true,
    setTurnEndMinMemory: true,
    shuffleSecurity: true,
    stackCardTrashLock: true,
    stackTrashLock: true,
    subscribeReplacement: true,
    subscribeSubTrigger: true,
    suspend: true,
    trash: true,
    trashBreedingPermanent: true,
    trashDigivolutionCards: true,
    trashDigivolutionCardsAtomic: true,
    trashFromSecurity: true,
    trashTopSecurityOfPlayerWithMostSecurity: true,
    unsuspend: true,
    useOptionFromHand: true,
    waiveColorRequirement: true,
  };

  // `addDpDeleteBudget`/`dpDeleteBudgetBonus` (BT19-011's inherited "AddToDPDeleteBudget"
  // modifier, interpreter.ts ~3206/3151) were the last two entries here: declared on Primitives
  // but genuinely unassigned by createPrimitives. Fixed by `DpDeleteBudgetLedger`
  // (dpDeleteBudget.ts), the same continuous-recompute-cleared shape as `deletionMaxDp.ts`,
  // wired from `GameEngine.recomputeContinuousEffects` (GameEngine.ts:1375) and assigned in
  // `createPrimitives` (primitives.ts). This allowlist is now empty; keep it that way — extend
  // it only with a comment explaining why a NEWLY unassigned method is a deliberate, understood
  // gap, never to make a newly-red case here go green without understanding it.
  const KNOWN_UNASSIGNED_PENDING_FOLLOWUP = new Set<keyof Primitives>([]);

  it("createPrimitives assigns every declared method except the documented pending follow-ups", () => {
    const h = harness();
    const missing = (Object.keys(ALL_PRIMITIVE_KEYS) as (keyof Primitives)[]).filter(
      (key) => !KNOWN_UNASSIGNED_PENDING_FOLLOWUP.has(key) && typeof h.fx[key] !== "function",
    );
    expect(missing).toEqual([]);
  });

  it("the pending-follow-up allowlist is exactly today's known gap (fails loudly if it grows)", () => {
    expect([...KNOWN_UNASSIGNED_PENDING_FOLLOWUP].sort()).toEqual([]);
  });

  it("grantCustom is assigned and callable (regression guard: was declared but never wired, so every ctx.fx.grantCustom?.() call site silently did nothing)", () => {
    const h = harness({ board: { 0: { battleArea: [battleDigimon("A", 3000)] } } });
    const p = h.s.perm("A");
    expect(typeof h.fx.grantCustom).toBe("function");
    expect(() =>
      h.fx.grantCustom!(
        p.permanentId,
        { unsuspendCost: { kind: "trashFromHand", count: 1 } },
        EffectDuration.UntilOpponentTurnEnd,
      ),
    ).not.toThrow();
  });
});

describe("primitives: resolveCardEffect / useOptionFromHand (BT26 gap fix)", () => {
  const FAKE_CARD_ID = "TEST-RESOLVE-CARD-EFFECT-OPTION";

  /** A throwaway module whose OnUseOption effect flips `ran` — proof it actually resolved. */
  function fakeUsableModule(ran: { value: boolean }): EffectModule {
    return {
      cardId: FAKE_CARD_ID,
      effectsForTiming(timing) {
        if (timing !== EffectTiming.OnUseOption) return [];
        return [
          {
            effectKey: `${FAKE_CARD_ID}/main`,
            description: "test-only: flips a flag when resolved",
            optional: false,
            isInherited: false,
            isSecurity: false,
            isLinked: false,
            maxPerTurn: -1,
            canTrigger: () => true,
            canActivate: () => true,
            resolve: async () => {
              ran.value = true;
            },
          },
        ];
      },
    };
  }

  it("resolveCardEffect runs a registered module's effect for the given timing", async () => {
    const h = harness();
    const ran = { value: false };
    registerCard(fakeUsableModule(ran));
    try {
      const ctx = { source: {} } as unknown as EffectContext;
      const didRun = await h.fx.resolveCardEffect(ctx, FAKE_CARD_ID, EffectTiming.OnUseOption);
      expect(didRun).toBe(true);
      expect(ran.value).toBe(true);
    } finally {
      unregisterCard(FAKE_CARD_ID);
    }
  });

  it("resolveCardEffect returns false and does nothing for an unregistered cardId", async () => {
    const h = harness();
    const ctx = { source: {} } as unknown as EffectContext;
    const didRun = await h.fx.resolveCardEffect(ctx, "NOT-A-REAL-CARD-ID", EffectTiming.OnUseOption);
    expect(didRun).toBe(false);
  });

  it(
    "useOptionFromHand resolves the used card's OnUseOption effect before trashing it " +
      "(regression: it used to only trash the card and fire whenOptionUsed, silently " +
      "skipping the Option's own effect body for BT26-012/-090, EX4-030, BT10-041, ST22-07 " +
      "and every other hand-written 'use 1 Option from hand' card)",
    async () => {
      const h = harness();
      const ran = { value: false };
      registerCard(fakeUsableModule(ran));
      try {
        const used = makeInstance(FAKE_CARD_ID, 0, true);
        const instanceId = used.instanceId;
        h.state.players[0]!.hand.push(used);
        const ctx = { source: {} } as unknown as EffectContext;

        const trashed = await h.fx.useOptionFromHand(ctx, instanceId, 3);

        expect(ran.value).toBe(true);
        expect(trashed.map((c) => c.instanceId)).toEqual([instanceId]);
        expect(h.state.players[0]!.hand).toHaveLength(0);
        expect(h.state.players[0]!.trash.some((c) => c.instanceId === instanceId)).toBe(true);
      } finally {
        unregisterCard(FAKE_CARD_ID);
      }
    },
  );

  it("does not trash an Option that placed itself in the battle area while resolving", async () => {
    const h = harness();
    const used = makeInstance(OPTION, 0, true);
    const instanceId = used.instanceId;
    h.state.players[0]!.hand.push(used);
    const module: EffectModule = {
      cardId: OPTION,
      effectsForTiming: (timing) =>
        timing === EffectTiming.OnUseOption
          ? [
              {
                effectKey: `${OPTION}/place-self`,
                description: "Place this card in the battle area.",
                optional: false,
                isInherited: false,
                isSecurity: false,
                isLinked: false,
                maxPerTurn: -1,
                canTrigger: () => true,
                canActivate: () => true,
                resolve: async (subCtx) => {
                  await subCtx.fx.placeOptionAsPermanent?.(instanceId);
                },
              },
            ]
          : [],
    };
    const previousModule = unregisterCard(OPTION);
    registerCard(module);
    try {
      const ctx = { source: { ownerSeat: 0, instanceId, cardId: OPTION }, fx: h.fx } as unknown as EffectContext;
      const trashed = await h.fx.useOptionFromHand(ctx, instanceId, 8);

      expect(trashed).toEqual([]);
      expect(h.state.players[0]!.trash.some((card) => card.instanceId === instanceId)).toBe(false);
      expect(h.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === instanceId)).toBe(true);
    } finally {
      unregisterCard(OPTION);
      if (previousModule !== undefined) registerCard(previousModule);
    }
  });

  it("uses and trashes the exact Option linked to a breeding-area Digimon", async () => {
    const h = harness({ board: { 0: { breeding: battleDigimon("egg-host", 3000) } } });
    const ran = { value: false };
    registerCard(fakeUsableModule(ran));
    try {
      const used = makeInstance(FAKE_CARD_ID, 0, true);
      h.state.players[0]!.breeding!.linked.push(used);
      const ctx = { source: { ownerSeat: 0 }, fx: h.fx } as unknown as EffectContext;

      const moved = await h.fx.useOptionFromHand(ctx, used.instanceId, 3);

      expect(ran.value).toBe(true);
      expect(moved.map((card) => card.instanceId)).toEqual([used.instanceId]);
      expect(h.state.players[0]!.breeding!.linked).toHaveLength(0);
      expect(h.state.players[0]!.trash.some((card) => card.instanceId === used.instanceId)).toBe(true);
    } finally {
      unregisterCard(FAKE_CARD_ID);
    }
  });

  it.each(["self-placement", "throwing effect"] as const)(
    "restores the parent Option after a nested Option with %s and before use notifications",
    async (outcome) => {
      const parent = makeInstance(OPTION, 0, true);
      const notificationParents: string[] = [];
      const resolvingChildren: string[] = [];
      const h: Harness = harness({
        onFireSubTrigger: async (event) => {
          if (event === "whenOptionUsed") {
            notificationParents.push(h.state.players[0]!.resolvingOption?.instanceId ?? "");
          }
        },
      });
      const used = makeInstance(OPTION, 0, true);
      h.state.players[0]!.hand.push(used);
      setResolvingOption(h.state.players[0]!, parent);
      const module: EffectModule = {
        cardId: OPTION,
        effectsForTiming: (timing) =>
          timing === EffectTiming.OnUseOption
            ? [
                {
                  effectKey: `${OPTION}/nested-lifecycle`,
                  description: "Resolve a nested Option.",
                  optional: false,
                  isInherited: false,
                  isSecurity: false,
                  isLinked: false,
                  maxPerTurn: -1,
                  canTrigger: () => true,
                  canActivate: () => true,
                  resolve: async (subCtx) => {
                    resolvingChildren.push(h.state.players[0]!.resolvingOption?.instanceId ?? "");
                    if (outcome === "throwing effect") {
                      throw new Error("nested-option-resolution-failure");
                    }
                    await subCtx.fx.placeOptionAsPermanent?.(used.instanceId);
                  },
                },
              ]
            : [],
      };
      const previousModule = unregisterCard(OPTION);
      registerCard(module);
      try {
        const ctx = {
          source: { ownerSeat: 0, instanceId: parent.instanceId, cardId: OPTION },
          fx: h.fx,
        } as unknown as EffectContext;
        const resolution = await h.fx.useOptionFromHand(ctx, used.instanceId, 8).then(
          (moved) => ({ moved, error: undefined }),
          (error: unknown) => ({ moved: undefined, error: error instanceof Error ? error.message : String(error) }),
        );
        const player = h.state.players[0]!;
        expect(resolution.error).toBe(outcome === "throwing effect" ? "nested-option-resolution-failure" : undefined);
        expect(resolution.moved ?? []).toEqual([]);
        expect(resolvingChildren).toEqual([used.instanceId]);
        expect(notificationParents).toEqual([parent.instanceId]);
        expect(player.resolvingOption?.instanceId).toBe(parent.instanceId);
        expect(player.hand).toHaveLength(0);
        expect(player.trash.filter((card) => card.instanceId === used.instanceId)).toHaveLength(
          outcome === "throwing effect" ? 1 : 0,
        );
        expect(player.battleArea.filter((permanent) => permanent.topCard.instanceId === used.instanceId)).toHaveLength(
          outcome === "self-placement" ? 1 : 0,
        );
        expect(
          [
            ...player.hand,
            ...player.trash,
            ...player.security,
            ...Array.from(player.battleArea).flatMap((permanent) => [permanent.topCard, ...permanent.stack]),
          ].filter((card) => card.instanceId === parent.instanceId),
        ).toHaveLength(0);
      } finally {
        unregisterCard(OPTION);
        if (previousModule !== undefined) {
          registerCard(previousModule);
        }
      }
    },
  );

  it("refuses to use the already-resolving physical Option again", async () => {
    const h = harness();
    const parent = makeInstance(OPTION, 0, true);
    setResolvingOption(h.state.players[0]!, parent);
    const ctx = {
      source: { ownerSeat: 0, instanceId: parent.instanceId, cardId: OPTION },
      fx: h.fx,
    } as unknown as EffectContext;
    expect(await h.fx.useOptionFromHand(ctx, parent.instanceId, 8)).toEqual([]);
    expect(h.state.players[0]!.resolvingOption?.instanceId).toBe(parent.instanceId);
    expect(h.state.players[0]!.trash).toHaveLength(0);
    expect(h.subTriggerFires).toHaveLength(0);
  });
});

describe("movement origin narration", () => {
  it("groups discards by hand owner while preserving the requested order", async () => {
    const h = harness({
      board: {
        0: {
          hand: [
            { card: DIGIMON, as: "first" },
            { card: TAMER, as: "last" },
          ],
        },
        1: { hand: [{ card: OPTION, as: "middle" }] },
      },
    });
    const ids = ["first", "middle", "last"].map((alias) => h.s.inst(alias).instanceId);
    await h.fx.trash(ids);
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        instanceIds: [ids[0]],
        cardIds: [DIGIMON],
        artIds: [DIGIMON],
        seat: 0,
        from: "hand",
        fromSeat: 0,
        to: "trash",
      },
      {
        kind: "cardsMoved",
        instanceIds: [ids[1]],
        cardIds: [OPTION],
        artIds: [OPTION],
        seat: 1,
        from: "hand",
        fromSeat: 1,
        to: "trash",
      },
      {
        kind: "cardsMoved",
        instanceIds: [ids[2]],
        cardIds: [TAMER],
        artIds: [TAMER],
        seat: 0,
        from: "hand",
        fromSeat: 0,
        to: "trash",
      },
    ]);
    expect(h.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([ids[0], ids[2]]);
    expect(h.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([ids[1]]);
  });

  it("returns an ordinary security card without marking a security check or exposing its identity", async () => {
    const h = harness({ board: { 1: { security: [{ card: DIGIMON, as: "hidden" }] } } });
    const id = h.s.inst("hidden").instanceId;
    await h.fx.returnToHand([id]);
    expect(h.events.filter((event) => event.kind === "cardsMoved")).toEqual([
      {
        kind: "cardsMoved",
        instanceIds: [id],
        from: "security",
        fromSeat: 1,
        to: "hand",
        seat: 1,
        handAddition: "transfer",
      },
    ]);
    expect(h.state.players[1]!.hand.map((card) => card.instanceId)).toEqual([id]);
  });
});
