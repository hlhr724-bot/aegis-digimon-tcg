import { describe, it, expect } from "vitest";
import {
  GameState,
  PlayerState,
  Permanent,
  CardInstance,
  EffectTiming,
  type Seat,
  type ServerEvent,
} from "@aegis/shared";
import { GameStateAccess } from "../state/access.js";
import { CombatController, type CombatHooks } from "./controller.js";
import type { BlockTiming } from "#api/engine/combat/types";
import type { TriggerInfo } from "../effects/EffectContext.js";

const DIGIMON_A = "AD1-001";
const DIGIMON_B = "AD1-002";

let seq = 0;
function digimon(seat: Seat, dp: number, opts: { suspended?: boolean; cardId?: string } = {}): Permanent {
  seq += 1;
  const top = new CardInstance();
  top.instanceId = `inst-${seq}`;
  top.cardId = opts.cardId ?? DIGIMON_A;
  top.ownerSeat = seat;
  top.faceUp = true;

  const permanent = new Permanent();
  permanent.permanentId = `perm-${seq}`;
  permanent.controllerSeat = seat;
  permanent.topCard = top;
  permanent.isSuspended = opts.suspended ?? false;
  permanent.inBreeding = false;
  permanent.enterFieldTurnCount = -1; // already-on-field sentinel (not this turn)
  permanent.baseDP = dp;
  permanent.currentDP = dp;
  return permanent;
}

function securityCard(seat: Seat): CardInstance {
  seq += 1;
  const card = new CardInstance();
  card.instanceId = `sec-${seq}`;
  card.cardId = DIGIMON_A;
  card.ownerSeat = seat;
  card.faceUp = false;
  return card;
}

function makeState(): GameState {
  const state = new GameState();
  for (const seat of [0, 1] as Seat[]) {
    const player = new PlayerState();
    player.seat = seat;
    state.players[seat] = player;
  }
  return state;
}

interface Harness {
  state: GameState;
  access: GameStateAccess;
  combat: CombatController;
  events: ServerEvent[];
  firedTimings: EffectTiming[];
  securityCalls: { defenderSeat: Seat; attackerPermanentId: string }[];
  firedSubTriggers: { event: string; payload: TriggerInfo }[];
  blockTimings: BlockTiming[];
  timeline: string[];
  attackPayloads: TriggerInfo[];
}

function harness(opts?: {
  preventBattleDeletion?: boolean;
  piercingChange?: { initial: boolean; afterDeletion: boolean };
  piercingWhenOpponentGone?: boolean;
  piercingReactionEvent?: "whenBattleWon" | "onDeletionOf";
  captureAttackPayloads?: TriggerInfo[];
  sweepEndOfAttack?: CombatHooks["sweepEndOfAttack"];
  onAttackTiming?: () => Promise<void>;
}): Harness {
  const state = makeState();
  const access = new GameStateAccess(state);
  const events: ServerEvent[] = [];
  const firedTimings: EffectTiming[] = [];
  const securityCalls: Harness["securityCalls"] = [];
  const firedSubTriggers: Harness["firedSubTriggers"] = [];
  const blockTimings: BlockTiming[] = [];
  const timeline: string[] = [];
  const attackPayloads = opts?.captureAttackPayloads ?? [];
  let hasPiercing = opts?.piercingChange?.initial ?? false;

  const hooks: CombatHooks = {
    emit: (e) => events.push(e),
    fireBlockTiming: async (block) => {
      blockTimings.push(block);
    },
    sweepEndOfAttack: opts?.sweepEndOfAttack,
    fireTiming: async (timing) => {
      firedTimings.push(timing);
      timeline.push(`timing:${timing}`);
      if (timing === EffectTiming.OnDestroyedAnyone && opts?.piercingChange !== undefined) {
        hasPiercing = opts.piercingChange.afterDeletion;
      }
    },
    hasPierce: () =>
      hasPiercing || (opts?.piercingWhenOpponentGone === true && state.players[1]!.battleArea.length === 0),
    fireSubTrigger: async (event, payload) => {
      if (event === opts?.piercingReactionEvent) hasPiercing = true;
      firedSubTriggers.push({ event, payload });
      timeline.push(`sub:${event}`);
    },
    prepareSubTrigger: (event, payload) => {
      timeline.push(`prepare:${event}`);
      return async () => {
        firedSubTriggers.push({ event, payload });
        timeline.push(`sub:${event}`);
      };
    },
    fireAttackTiming:
      opts?.captureAttackPayloads === undefined && opts?.onAttackTiming === undefined
        ? undefined
        : async (_trigger, _alliance, options) => {
            attackPayloads.push(options?.subTriggerPayload ?? {});
            await opts?.onAttackTiming?.();
            return { allianceResolvedInWindow: false, raidResolvedInWindow: false, subTriggersResolvedInWindow: false };
          },
    consultLeavePrevention: async (permanentIds) => {
      timeline.push("replacement:consultLeavePrevention");
      return opts?.preventBattleDeletion === true ? new Set(permanentIds) : new Set<string>();
    },
    checkSecurity: async (defenderSeat, attackerPermanentId) => {
      securityCalls.push({ defenderSeat, attackerPermanentId });
    },
  };

  return {
    state,
    access,
    combat: new CombatController(access, hooks),
    events,
    firedTimings,
    securityCalls,
    firedSubTriggers,
    blockTimings,
    timeline,
    attackPayloads,
  };
}

const ids = (events: ServerEvent[], kind: ServerEvent["kind"]): ServerEvent[] => events.filter((e) => e.kind === kind);

it.each(["player", "ended", "removed"] as const)(
  "Discord 1557002713047502968: pending effect-battle Piercing respects the %s attack boundary",
  async (boundary) => {
    const attacker = digimon(0, 9000);
    const victim = digimon(1, 3000, { suspended: true });
    const h = harness({
      piercingChange: { initial: true, afterDeletion: true },
      onAttackTiming: async () => {
        await h.combat.resolveBattle(attacker, victim);
        if (boundary === "ended") h.combat.endAttack();
        if (boundary === "removed") h.access.deletePermanent(attacker.permanentId);
      },
    });
    h.state.players[0]!.battleArea.push(attacker);
    h.state.players[1]!.battleArea.push(victim);
    h.state.players[1]!.security.push(securityCard(1));
    await h.combat.resolveAttack(
      0,
      attacker,
      boundary === "player" ? { kind: "player" } : { kind: "permanent", permanentId: victim.permanentId },
    );
    expect(h.state.players[1]!.battleArea).toHaveLength(0);
    expect(h.securityCalls).toHaveLength(boundary === "player" ? 1 : 0);
    expect(ids(h.events, "attackEnded")).toHaveLength(1);
  },
);

/**
 * resolveAttack is async and `await`s the (no-op) When-Attacking timings before it
 * opens the block window, so the window is not set synchronously after the call.
 * Flush the microtask queue a few times to let those awaited promises settle and
 * the controller reach runBlockWindow before the test inspects / resolves it.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
}

it("#5015 awaits the duration sweep before publishing attack completion or returning", async () => {
  let finishSweep!: () => void;
  let enterSweep!: () => void;
  let sweepStarted = false;
  let attackReturned = false;
  const sweepEntered = new Promise<void>((resolve) => {
    enterSweep = resolve;
  });
  const sweep = new Promise<void>((resolve) => {
    finishSweep = resolve;
  });
  const h = harness({
    sweepEndOfAttack: () => {
      sweepStarted = true;
      enterSweep();
      return sweep;
    },
  });
  const attacker = digimon(0, 9000);
  const defender = digimon(1, 4000, { suspended: true });
  h.state.players[0]!.battleArea.push(attacker);
  h.state.players[1]!.battleArea.push(defender);
  const attack = h.combat
    .resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId })
    .then(() => {
      attackReturned = true;
    });
  await sweepEntered;
  await flush();
  const duringSweep = {
    sweepStarted,
    attackReturned,
    events: h.events
      .filter((event) => event.kind === "combatResolved" || event.kind === "attackEnded")
      .map(({ kind }) => kind),
  };
  finishSweep();
  await attack;
  expect(duringSweep).toEqual({ sweepStarted: true, attackReturned: false, events: [] });
  expect(
    h.events.filter((event) => event.kind === "combatResolved" || event.kind === "attackEnded").map(({ kind }) => kind),
  ).toEqual(["combatResolved", "attackEnded"]);
});

describe("CombatController.resolveAttack — Digimon vs Digimon", () => {
  it("marks an effect battle between the declared pair apart from the attack's own battle", async () => {
    let effectBattle = async () => {};
    const h = harness({ preventBattleDeletion: true, onAttackTiming: () => effectBattle() });
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 3000, { suspended: true });
    h.state.players[0]!.battleArea.push(attacker);
    h.state.players[1]!.battleArea.push(defender);
    let effectComparisons: ServerEvent[] = [];
    effectBattle = async () => {
      await h.combat.resolveBattle(attacker, defender);
      effectComparisons = h.events.filter((event) => event.kind === "battleCompared");
    };
    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });
    const effectComparison = {
      kind: "battleCompared",
      attackerPermanentId: attacker.permanentId,
      defenderPermanentId: defender.permanentId,
      loserPermanentIds: [defender.permanentId],
      effectBattle: { attackerSeat: 0, attackerCardId: DIGIMON_A, defenderCardId: DIGIMON_A },
    };
    expect(effectComparisons).toEqual([effectComparison]);
    // Protection spared the defender from both blows, so the attack's battle is compared too.
    expect(h.events.filter((event) => event.kind === "battleCompared")).toEqual([
      effectComparison,
      {
        kind: "battleCompared",
        attackerPermanentId: attacker.permanentId,
        defenderPermanentId: defender.permanentId,
        loserPermanentIds: [defender.permanentId],
      },
    ]);
  });
  it("publishes no attack result when an effect battle deletes the target before the attack's battle", async () => {
    let effectBattle = async () => {};
    const h = harness({ onAttackTiming: () => effectBattle() });
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 3000, { suspended: true });
    h.state.players[0]!.battleArea.push(attacker);
    h.state.players[1]!.battleArea.push(defender);
    effectBattle = async () => {
      effectBattle = async () => {};
      await h.combat.resolveBattle(attacker, defender);
    };
    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });
    expect(h.state.players[1]!.battleArea).toHaveLength(0);
    expect(ids(h.events, "combatResolved")).toEqual([]);
    expect(ids(h.events, "attackEnded")).toHaveLength(1);
  });

  it("publishes the attack's own battle as its result", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 3000, { suspended: true });
    h.state.players[0]!.battleArea.push(attacker);
    h.state.players[1]!.battleArea.push(defender);
    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });
    expect(ids(h.events, "combatResolved")).toEqual([
      {
        kind: "combatResolved",
        seat: 0,
        attackerPermanentId: attacker.permanentId,
        deletedPermanentIds: [defender.permanentId],
      },
    ]);
  });

  it("does not trigger Piercing acquired from a deleted Token's reaction", async () => {
    const h = harness({ piercingChange: { initial: false, afterDeletion: true } });
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 3000, { suspended: true, cardId: "TOKEN-Petrification-Token" });
    h.state.players[0]!.battleArea.push(attacker);
    h.state.players[1]!.battleArea.push(defender);
    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });
    expect(h.state.players[1]!.battleArea).toHaveLength(0);
    expect(h.firedTimings.filter((timing) => timing === EffectTiming.OnDestroyedAnyone)).toHaveLength(1);
    expect(h.securityCalls).toHaveLength(0);
  });

  it.each(["whenBattleWon", "onDeletionOf"] as const)(
    "does not retroactively trigger Piercing gained by %s",
    async (event) => {
      const h = harness({ piercingReactionEvent: event });
      const attacker = digimon(0, 9000);
      const defender = digimon(1, 4000, { suspended: true });
      h.state.players[0]!.battleArea.push(attacker);
      h.state.players[1]!.battleArea.push(defender);
      await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });
      expect(h.state.players[1]!.battleArea).toHaveLength(0);
      expect(h.firedSubTriggers.some((trigger) => trigger.event === event)).toBe(true);
      expect(h.securityCalls).toHaveLength(0);
    },
  );

  it("triggers Piercing gained simultaneously with the last opposing battle deletion (Q3883)", async () => {
    const h = harness({ piercingWhenOpponentGone: true });
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true });
    h.state.players[0]!.battleArea.push(attacker);
    h.state.players[1]!.battleArea.push(defender);
    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });
    expect(h.state.players[0]!.battleArea).toHaveLength(1);
    expect(h.state.players[1]!.battleArea).toHaveLength(0);
    expect(h.securityCalls).toHaveLength(1);
  });

  it("Q7339: snapshots whenDeletesInBattle when both battle participants are deleted", async () => {
    const h = harness();
    const attacker = digimon(0, 5000);
    const defender = digimon(1, 5000, { suspended: true });
    h.state.players[0]!.battleArea.push(attacker);
    h.state.players[1]!.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.state.players[0]!.battleArea).toHaveLength(0);
    expect(h.state.players[1]!.battleArea).toHaveLength(0);
    expect(h.firedSubTriggers).toContainEqual({
      event: "whenDeletesInBattle",
      payload: expect.objectContaining({
        subjectPermanentId: attacker.permanentId,
        attackerPermanentId: attacker.permanentId,
        deletedPermanentId: defender.permanentId,
      }),
    });
  });

  it.each([
    { initial: true, afterDeletion: false, checks: 1 },
    { initial: false, afterDeletion: true, checks: 0 },
  ])(
    "Piercing is captured before deletion reactions: $initial -> $afterDeletion",
    async ({ initial, afterDeletion, checks }) => {
      const h = harness({ piercingChange: { initial, afterDeletion } });
      const attacker = digimon(0, 9000);
      const defender = digimon(1, 4000, { suspended: true });
      h.state.players[0]!.battleArea.push(attacker);
      h.state.players[1]!.battleArea.push(defender);
      await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });
      expect(h.state.players[1]!.battleArea).toHaveLength(0);
      expect(h.securityCalls).toHaveLength(checks);
    },
  );

  it("snapshots attack watchers before System-A timings and activates them afterward", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.timeline.indexOf("prepare:whenAttacking")).toBeLessThan(
      h.timeline.indexOf(`timing:${EffectTiming.OnUseAttack}`),
    );
    expect(h.timeline.indexOf(`timing:${EffectTiming.OnAllyAttack}`)).toBeLessThan(
      h.timeline.indexOf("sub:whenAttacking"),
    );
  });

  it("runs an attack-cost callback after declaration and before suspension watchers", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(
      0,
      attacker,
      { kind: "permanent", permanentId: defender.permanentId },
      {
        afterAttackDeclaration: async () => {
          h.timeline.push(`attack-cost:${h.combat.isAttacking}`);
        },
      },
    );

    expect(h.timeline).toContain("attack-cost:true");
    expect(h.timeline.indexOf("attack-cost:true")).toBeLessThan(h.timeline.indexOf("sub:whenSuspended"));
    expect(h.combat.isAttacking).toBe(false);
  });

  it("cleans up an in-flight attack when an attack-cost callback rejects", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await expect(
      h.combat.resolveAttack(
        0,
        attacker,
        { kind: "permanent", permanentId: defender.permanentId },
        {
          afterAttackDeclaration: async () => {
            throw new Error("attack-cost failed");
          },
        },
      ),
    ).rejects.toThrow("attack-cost failed");
    expect(h.combat.isAttacking).toBe(false);
    expect(h.combat.currentAttackerId).toBeUndefined();
  });

  it("attacker with higher DP deletes the defender and suspends the attacker", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(attacker.isSuspended).toBe(true); // attacker suspended on declare
    expect(h.firedSubTriggers.find(({ event }) => event === "whenSuspended")?.payload).toMatchObject({
      subjectPermanentId: attacker.permanentId,
      suspendedPermanentId: attacker.permanentId,
    });
    expect(h.access.permanentById(defender.permanentId)).toBeUndefined(); // defender deleted
    expect(h.access.permanentById(attacker.permanentId)).toBeDefined(); // attacker survives
    // Defender's card went to its owner's trash.
    expect(h.state.players[1]?.trash.some((c) => c.instanceId === defender.topCard.instanceId)).toBe(true);

    const resolved = ids(h.events, "combatResolved");
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ deletedPermanentIds: [defender.permanentId] });
  });

  it("a tie deletes BOTH permanents", async () => {
    const h = harness();
    const attacker = digimon(0, 5000);
    const defender = digimon(1, 5000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.access.permanentById(attacker.permanentId)).toBeUndefined();
    expect(h.access.permanentById(defender.permanentId)).toBeUndefined();
    const resolved = ids(h.events, "combatResolved");
    expect(resolved[0]).toMatchObject({
      deletedPermanentIds: expect.arrayContaining([attacker.permanentId, defender.permanentId]),
    });
  });

  it("a weaker attacker is deleted; the defender survives", async () => {
    const h = harness();
    const attacker = digimon(0, 2000);
    const defender = digimon(1, 8000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.access.permanentById(attacker.permanentId)).toBeUndefined();
    expect(h.access.permanentById(defender.permanentId)).toBeDefined();
  });

  it("fires whenBattleWon for the winning attacker (CR §14-2-1), naming it as the subject", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    // FAILS-WHEN-REVERTED: drop the fireSubTrigger("whenBattleWon", …) in
    // resolveDigimonBattle => this stays empty => RED.
    const won = h.firedSubTriggers.filter((f) => f.event === "whenBattleWon");
    expect(won).toHaveLength(1);
    expect(won[0]?.payload.subjectPermanentId).toBe(attacker.permanentId);
    expect(h.timeline.indexOf("replacement:consultLeavePrevention")).toBeLessThan(
      h.timeline.indexOf("sub:whenBattleWon"),
    );
    expect(h.timeline.indexOf("sub:whenBattleWon")).toBeLessThan(
      h.timeline.indexOf(`timing:${EffectTiming.OnDestroyedAnyone}`),
    );
  });

  it("preserves the attack mechanic in the whenAttacking sub-trigger payload", async () => {
    const attackPayloads: TriggerInfo[] = [];
    const h = harness({ captureAttackPayloads: attackPayloads });
    const attacker = digimon(0, 9000);
    h.state.players[0]?.battleArea.push(attacker);

    await h.combat.resolveAttack(0, attacker, { kind: "player" }, { attackMechanic: "Execute" });

    expect(attackPayloads).toHaveLength(1);
    expect(attackPayloads[0]?.attackMechanic).toBe("Execute");
  });

  it("fires whenBattleWon for the winning DEFENDER when the attacker loses", async () => {
    const h = harness();
    const attacker = digimon(0, 2000);
    const defender = digimon(1, 8000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    const won = h.firedSubTriggers.filter((f) => f.event === "whenBattleWon");
    expect(won).toHaveLength(1);
    expect(won[0]?.payload.subjectPermanentId).toBe(defender.permanentId);
    expect(h.timeline.indexOf("replacement:consultLeavePrevention")).toBeLessThan(
      h.timeline.indexOf(`timing:${EffectTiming.OnDestroyedAnyone}`),
    );
    // Q7463 activation ordering is asserted through the real GameEngine timing window in
    // ex13PaladinBattleDeletionOrdering.test.ts; this controller harness has no stack resolver.
  });

  it("still fires whenBattleWon after the losing Digimon prevents deletion (Q7022/Q7023)", async () => {
    const h = harness({ preventBattleDeletion: true });
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.access.permanentById(defender.permanentId)).toBeDefined();
    expect(h.firedSubTriggers.filter((f) => f.event === "whenBattleWon")).toHaveLength(1);
    expect(h.timeline.indexOf("replacement:consultLeavePrevention")).toBeLessThan(
      h.timeline.indexOf("sub:whenBattleWon"),
    );
  });

  it("does NOT fire whenBattleWon on a tie (no winner)", async () => {
    const h = harness();
    const attacker = digimon(0, 5000);
    const defender = digimon(1, 5000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.firedSubTriggers.some((f) => f.event === "whenBattleWon")).toBe(false);
  });

  it("fires When Attacking (OnUseAttack + OnAllyAttack) and end-of-attack timings", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.firedTimings).toContain(EffectTiming.OnUseAttack);
    expect(h.firedTimings).toContain(EffectTiming.OnAllyAttack);
    expect(h.firedTimings).toContain(EffectTiming.OnEndAttack);
  });

  it("passes the declaration-time attack payload into the combined trigger window", async () => {
    const payloads: TriggerInfo[] = [];
    const h = harness({ captureAttackPayloads: payloads });
    const first = digimon(0, 9000);
    const second = digimon(0, 7000);
    h.state.players[0]?.battleArea.push(first, second);

    await h.combat.resolveAttack(0, first, { kind: "player" });
    await h.combat.resolveAttack(0, second, { kind: "player" });

    expect(payloads).toHaveLength(2);
    expect(payloads.map((payload) => payload.attackerDPAtDeclaration)).toEqual([9000, 7000]);
    expect(payloads.map((payload) => payload.attackSequence)).toEqual([1, 2]);
    expect(payloads.every((payload) => payload.attackerPermanentId !== undefined)).toBe(true);
  });
});

describe("CombatController.redirectTarget", () => {
  it("refuses to switch an attack to the target it already has", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);
    h.state.players[1]?.security.push(securityCard(1));
    const switches: boolean[] = [];

    await h.combat.resolveAttack(
      0,
      attacker,
      { kind: "permanent", permanentId: defender.permanentId },
      {
        afterAttackDeclaration: async () => {
          switches.push(h.combat.redirectTarget({ kind: "permanent", permanentId: defender.permanentId }));
          switches.push(h.combat.redirectTarget({ kind: "player" }));
          switches.push(h.combat.redirectTarget({ kind: "player" }));
        },
      },
    );

    expect(switches).toEqual([false, true, false]);
  });
});

describe("CombatController.resolveAttack — player-directed (security hand-off)", () => {
  it("drains the current timing while combat is open and before the security check", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const redirectedDefender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(redirectedDefender);
    h.state.players[1]?.security.push(securityCard(1));
    let drained = false;

    await h.combat.resolveAttack(
      0,
      attacker,
      { kind: "player" },
      {
        drainTimingWindow: async () => {
          expect(h.combat.isAttacking).toBe(true);
          expect(h.securityCalls).toHaveLength(0);
          expect(h.combat.redirectTarget({ kind: "permanent", permanentId: redirectedDefender.permanentId })).toBe(
            !drained,
          );
          drained = true;
        },
      },
    );

    expect(drained).toBe(true);
    expect(h.securityCalls).toHaveLength(0);
    expect(h.access.permanentById(redirectedDefender.permanentId)).toBeUndefined();
    expect(h.firedTimings.at(-1)).toBe(EffectTiming.OnEndAttack);
  });

  it("with no eligible blocker, hands the unblocked player attack to security-and-win-check", async () => {
    const h = harness();
    const attacker = digimon(0, 5000);
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.security.push(securityCard(1)); // opponent has security; no blockers in play

    await h.combat.resolveAttack(0, attacker, { kind: "player" });

    expect(h.securityCalls).toEqual([{ defenderSeat: 1, attackerPermanentId: attacker.permanentId }]);
    // Combat does NOT flip security itself (that is the sibling subsystem's job).
    expect(h.state.players[1]?.security).toHaveLength(1);
  });

  it("does not announce a block window when no eligible blocker exists", async () => {
    const h = harness();
    const attacker = digimon(0, 5000);
    h.state.players[0]?.battleArea.push(attacker);

    await h.combat.resolveAttack(0, attacker, { kind: "player" });

    expect(ids(h.events, "blockWindowOpened")).toHaveLength(0);
    expect(h.combat.hasOpenBlockWindow).toBe(false);
  });
});

describe("CombatController — block window", () => {
  it("declareBlock redirects the attack onto the blocker, suspends it, and resolves combat there", async () => {
    const h = harness();
    const attacker = digimon(0, 6000);
    const blocker = digimon(1, 3000); // unsuspended -> eligible to block
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(blocker);
    h.state.players[1]?.security.push(securityCard(1));

    const done = h.combat.resolveAttack(0, attacker, { kind: "player" });
    await flush();

    // The window must now be open for the defending seat with the blocker eligible.
    expect(h.combat.hasOpenBlockWindow).toBe(true);
    expect(h.combat.blockingSeat).toBe(1);
    expect(h.combat.attackingPermanentId).toBe(attacker.permanentId);

    const accepted = h.combat.resolveBlock(1, blocker.permanentId);
    expect(accepted).toBe(true);

    await done;

    // Blocker was suspended and battled (6000 vs 3000 -> blocker deleted).
    expect(h.access.permanentById(blocker.permanentId)).toBeUndefined();
    expect(h.access.permanentById(attacker.permanentId)).toBeDefined();
    // Security was NOT checked because the attack was blocked.
    expect(h.securityCalls).toHaveLength(0);
    expect(ids(h.events, "blocked")).toHaveLength(1);
    expect(h.blockTimings).toEqual([
      { attackerPermanentId: attacker.permanentId, blockerPermanentId: blocker.permanentId, blockerSuspended: true },
    ]);
  });

  it("declineBlock lets the player-directed attack proceed to the security hand-off", async () => {
    const h = harness();
    const attacker = digimon(0, 6000);
    const blocker = digimon(1, 3000);
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(blocker);
    h.state.players[1]?.security.push(securityCard(1));

    const done = h.combat.resolveAttack(0, attacker, { kind: "player" });
    await flush();
    expect(h.combat.hasOpenBlockWindow).toBe(true);

    expect(h.combat.resolveBlock(1, undefined)).toBe(true); // decline
    await done;

    expect(ids(h.events, "blockDeclined")).toHaveLength(1);
    expect(h.securityCalls).toEqual([{ defenderSeat: 1, attackerPermanentId: attacker.permanentId }]);
    expect(h.access.permanentById(blocker.permanentId)).toBeDefined(); // blocker untouched
    expect(blocker.isSuspended).toBe(false);
  });

  it("rejects a block from the wrong seat and an ineligible blocker", async () => {
    const h = harness();
    const attacker = digimon(0, 6000);
    const blocker = digimon(1, 3000);
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(blocker);

    const done = h.combat.resolveAttack(0, attacker, { kind: "player" });
    await flush();

    expect(h.combat.resolveBlock(0, blocker.permanentId)).toBe(false); // wrong seat
    expect(h.combat.resolveBlock(1, "not-a-real-permanent")).toBe(false); // ineligible

    // Window is still open; a legal decline closes it.
    expect(h.combat.hasOpenBlockWindow).toBe(true);
    expect(h.combat.resolveBlock(1, undefined)).toBe(true);
    await done;
  });

  it("no longer reports an open window once combat finishes", async () => {
    const h = harness();
    const attacker = digimon(0, 6000);
    h.state.players[0]?.battleArea.push(attacker); // player attack, no blockers
    h.state.players[1]?.security.push(securityCard(1));

    await h.combat.resolveAttack(0, attacker, { kind: "player" });

    expect(h.combat.hasOpenBlockWindow).toBe(false);
    expect(h.combat.isAttacking).toBe(false);
  });
});

// Comprehensive Rules §11-2-6: "Even if the attack target Digimon is removed during an
// attack, that Digimon remains the attack target, but the attack fails." A permanent
// target that vanishes mid-resolution (deleted/bounced by a When-Attacking effect, or
// during the block window) must fizzle — it must NOT be reinterpreted as a
// player-directed attack just because `defender` reads as undefined.
describe("CombatController.resolveAttack — attack target vanishes mid-resolution (§11-2-6)", () => {
  it("fizzles (no security check, no battle) when the targeted Digimon is deleted before the block window", async () => {
    const state = makeState();
    const access = new GameStateAccess(state);
    const attacker = digimon(0, 5000);
    const defender = digimon(1, 3000, { suspended: true, cardId: DIGIMON_B });
    state.players[0]?.battleArea.push(attacker);
    state.players[1]?.battleArea.push(defender);

    const events: ServerEvent[] = [];
    const firedTimings: EffectTiming[] = [];
    const securityCalls: Harness["securityCalls"] = [];
    const hooks: CombatHooks = {
      emit: (e) => events.push(e),
      fireBlockTiming: async () => {},
      fireTiming: async (timing) => {
        firedTimings.push(timing);
        // Simulate a When-Attacking effect deleting the attack target mid-resolution.
        if (timing === EffectTiming.OnUseAttack) {
          access.deletePermanent(defender.permanentId);
        }
      },
      checkSecurity: async (defenderSeat, attackerPermanentId) => {
        securityCalls.push({ defenderSeat, attackerPermanentId });
      },
    };
    const combat = new CombatController(access, hooks);

    await combat.resolveAttack(0, attacker, {
      kind: "permanent",
      permanentId: defender.permanentId,
    });

    // Must NOT fall back to a player-directed security check.
    expect(securityCalls).toHaveLength(0);
    // No battle resolution either (there is no defender to battle).
    expect(ids(events, "combatResolved")).toHaveLength(0);
    // But the attack still reaches End of Attack (§11-6).
    expect(firedTimings).toContain(EffectTiming.OnEndAttack);
  });
});

// Comprehensive Rules §11-5-1-4 / §11-6: an unsuccessful attack "ends without anything
// happening" but the flow still reaches the End of Attack timing. The attacker-invalidation
// guards must fire OnEndAttack, mirroring the sibling `endRequested` (BT23-069 "end that
// attack") path, rather than returning early and silently skipping the window.
describe("CombatController.resolveAttack — attacker invalidated mid-resolution still fires OnEndAttack", () => {
  it("fires OnEndAttack when the attacker leaves the field during When Attacking", async () => {
    const state = makeState();
    const access = new GameStateAccess(state);
    const attacker = digimon(0, 5000);
    state.players[0]?.battleArea.push(attacker);
    state.players[1]?.security.push(securityCard(1));

    const firedTimings: EffectTiming[] = [];
    const securityCalls: Harness["securityCalls"] = [];
    const hooks: CombatHooks = {
      emit: () => {},
      fireBlockTiming: async () => {},
      fireTiming: async (timing) => {
        firedTimings.push(timing);
        // Simulate a When-Attacking effect removing the attacker itself.
        if (timing === EffectTiming.OnUseAttack) {
          access.deletePermanent(attacker.permanentId);
        }
      },
      checkSecurity: async (defenderSeat, attackerPermanentId) => {
        securityCalls.push({ defenderSeat, attackerPermanentId });
      },
    };
    const combat = new CombatController(access, hooks);

    await combat.resolveAttack(0, attacker, { kind: "player" });

    expect(firedTimings).toContain(EffectTiming.OnEndAttack);
    expect(securityCalls).toHaveLength(0);
  });

  it("fires OnEndAttack when the attacker leaves the field during the block window", async () => {
    const h = harness();
    const attacker = digimon(0, 6000);
    const blocker = digimon(1, 3000);
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(blocker);

    const done = h.combat.resolveAttack(0, attacker, { kind: "player" });
    await flush();
    expect(h.combat.hasOpenBlockWindow).toBe(true);

    // Simulate the attacker leaving the field while the block window is open (e.g. an
    // opponent's instant-speed removal effect).
    h.access.deletePermanent(attacker.permanentId);

    expect(h.combat.resolveBlock(1, undefined)).toBe(true); // decline
    await done;

    expect(h.firedTimings).toContain(EffectTiming.OnEndAttack);
    expect(h.securityCalls).toHaveLength(0);
  });
});

/**
 * Combat suspension bypasses the `fx.suspend` primitive on purpose — a "can't be suspended
 * by effects" restriction must not stop a Digimon attacking (KB BT19-101 Q3185). That left
 * the `whenSuspended` bus silent for the most common suspension of all, so 106 card modules
 * watching "when any Digimon suspend" never fired on an attack or a block.
 *
 * KB BT17-089 draws the line: "suspending from an attack declaration is due to the rules",
 * so it is a genuine suspension but not an effect-driven one.
 */
describe("combat suspension fires the whenSuspended bus", () => {
  const suspensionsFired = (h: Harness): string[] =>
    h.firedSubTriggers.filter((f) => f.event === "whenSuspended").map((f) => f.payload.suspendedPermanentId as string);

  it("fires for the attacker suspending to declare", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(suspensionsFired(h)).toContain(attacker.permanentId);
    expect(h.firedTimings).toContain(EffectTiming.OnTappedAnyone);
    expect(h.timeline.indexOf(`timing:${EffectTiming.OnTappedAnyone}`)).toBeLessThan(
      h.timeline.indexOf(`timing:${EffectTiming.OnUseAttack}`),
    );
  });

  it("hands the blocker's rules suspension to block timing", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const blocker = digimon(1, 3000, { cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(blocker);

    const done = h.combat.resolveAttack(0, attacker, { kind: "player" });
    await flush();
    h.combat.resolveBlock(1, blocker.permanentId);
    await done;

    expect(h.blockTimings).toEqual([
      { attackerPermanentId: attacker.permanentId, blockerPermanentId: blocker.permanentId, blockerSuspended: true },
    ]);
  });

  it("does not fire for an attack declared without tapping", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(
      0,
      attacker,
      { kind: "permanent", permanentId: defender.permanentId },
      { withoutTap: true },
    );

    expect(suspensionsFired(h)).not.toContain(attacker.permanentId);
  });

  it("does not fire again for an already-suspended permanent", async () => {
    const h = harness();
    const attacker = digimon(0, 9000, { suspended: true });
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(suspensionsFired(h)).not.toContain(attacker.permanentId);
  });

  it("leaves whenEffectSuspends unfired — an attack suspension is not an effect's doing", async () => {
    const h = harness();
    const attacker = digimon(0, 9000);
    const defender = digimon(1, 4000, { suspended: true, cardId: DIGIMON_B });
    h.state.players[0]?.battleArea.push(attacker);
    h.state.players[1]?.battleArea.push(defender);

    await h.combat.resolveAttack(0, attacker, { kind: "permanent", permanentId: defender.permanentId });

    expect(h.firedSubTriggers.map((f) => f.event)).not.toContain("whenEffectSuspends");
  });
});
