import { expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionManager } from "#api/engine/decisions/index";
import { MulliganCoordinator } from "#api/engine/mulligan";
import { CombatController } from "#api/engine/combat/controller";
import type { CombatHooks } from "#api/engine/combat/types";
import type { CombatControllerState } from "#api/engine/combat/CombatControllerState";
import { setupEngine } from "#api/engine/testkit/harness";
import { GameStateAccess } from "#api/engine/state/access";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

type CombatParams = { hooks?: Partial<CombatHooks> };

function createGate() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createCombat({ hooks = {} }: CombatParams = {}) {
  const setup = setupEngine({
    0: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 12000 }] },
    1: { battleArea: [{ card: "BT1-010", as: "defender", dp: 1000 }] },
  });
  const combat = new CombatController(new GameStateAccess(setup.state), {
    emit: (event) => {
      if (event.kind === "blockWindowOpened") {
        queueMicrotask(() => combat.resolveBlock(1, event.mustBlock ? event.eligibleBlockerIds[0] : undefined));
      }
      if (event.kind === "counterWindowOpened") {
        queueMicrotask(() => combat.resolveCounterPass(event.defendingSeat));
      }
    },
    fireTiming: async () => {},
    fireBlockTiming: async () => {},
    checkSecurity: async () => {},
    ...hooks,
  });
  return { ...setup, combat };
}

it("continues decision and mulligan identifiers using destination transports", async () => {
  const originalRequests: DecisionRequest[] = [];
  const destinationRequests: DecisionRequest[] = [];
  const originalState = new GameState();
  const destinationState = new GameState();
  const original = new DecisionManager(originalState, {
    requestDecision: (_seat, request) => {
      originalRequests.push(request);
    },
  });
  const destination = new DecisionManager(destinationState, {
    requestDecision: (_seat, request) => {
      destinationRequests.push(request);
    },
  });
  const first = original.request({ seat: 0, kind: "optional", promptText: "First decision" });
  expect(() => original.getRuntimeState()).toThrow("open decision");
  expect(original.respond(0, originalRequests[0]!.decisionId, { kind: "optional", accept: true })).toBe(true);
  await first;
  destination.restoreRuntimeState(JSON.parse(JSON.stringify(original.getRuntimeState())));
  const next = destination.request({ seat: 0, kind: "optional", promptText: "Next decision" });
  expect(destinationRequests[0]!.decisionId).toBe("dec-2");
  expect(originalRequests).toHaveLength(1);
  expect(() => destination.restoreRuntimeState({ sequence: 0 })).toThrow("open decision");
  destination.respond(0, destinationRequests[0]!.decisionId, { kind: "optional", accept: false });
  await next;
  const mulligan = new MulliganCoordinator(originalState, {
    requestDecision: (_seat, request) => {
      originalRequests.push(request);
    },
  });
  const restoredMulligan = new MulliganCoordinator(destinationState, {
    requestDecision: (_seat, request) => {
      destinationRequests.push(request);
    },
  });
  const keep = mulligan.request(0);
  expect(() => mulligan.getRuntimeState()).toThrow("open mulligan");
  mulligan.answer(0, true);
  await keep;
  restoredMulligan.restoreRuntimeState(JSON.parse(JSON.stringify(mulligan.getRuntimeState())));
  const redraw = restoredMulligan.request(1);
  expect(destinationRequests.at(-1)!.decisionId).toBe("mull-2");
  restoredMulligan.answer(1, false);
  expect(await redraw).toBe(false);
  expect(() => destination.restoreRuntimeState({ sequence: -1 })).toThrow("Invalid");
  expect(destination.getRuntimeState().sequence).toBe(2);
});

it("retains combat declaration sequence and attack history across a JSON graph round trip", async () => {
  const original = createCombat();
  const attacker = original.perm("attacker");
  await original.combat.resolveAttack(0, attacker, { kind: "player" });
  const raw = original.combat.getRuntimeState();
  expect(raw.attackSequence).toBe(1);
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(encodeRuntimeGraph({ value: raw }))),
  }) as CombatControllerState;
  const destination = createCombat();
  destination.combat.restoreRuntimeState(restored);
  expect(destination.combat.attackedThisTurn).toBe(restored.attackedThisTurn);
  expect(destination.combat.attackedThisTurn.has(attacker.permanentId)).toBe(true);
  await destination.combat.resolveAttack(0, destination.perm("attacker"), { kind: "player" });
  expect(destination.combat.getRuntimeState().attackSequence).toBe(2);
  expect(original.combat.getRuntimeState().attackSequence).toBe(1);
  destination.combat.attackedThisTurn.clear();
  expect(original.combat.attackedThisTurn.has(attacker.permanentId)).toBe(true);
});

it("rejects combat snapshots until asynchronous attack cleanup has fully settled", async () => {
  const entered = createGate();
  const release = createGate();
  const world = createCombat({
    hooks: {
      sweepEndOfAttack: async () => {
        entered.resolve();
        await release.promise;
      },
    },
  });
  const running = world.combat.resolveAttack(0, world.perm("attacker"), { kind: "player" });
  expect(() => world.combat.getRuntimeState()).toThrow("active combat");
  await entered.promise;
  expect(world.combat.isAttacking).toBe(false);
  expect(() => world.combat.getRuntimeState()).toThrow("active combat");
  expect(() => world.combat.restoreRuntimeState({ attackSequence: 0, attackedThisTurn: new Set() })).toThrow(
    "active combat",
  );
  release.resolve();
  await running;
  expect(world.combat.getRuntimeState().attackSequence).toBe(1);
});

it("rejects combat snapshots while a direct battle's final recompute is still running", async () => {
  const entered = createGate();
  const release = createGate();
  let recomputes = 0;
  const world = createCombat({
    hooks: {
      recomputeBattleEffects: async () => {
        if (++recomputes === 2) {
          entered.resolve();
          await release.promise;
        }
      },
    },
  });
  const running = world.combat.resolveBattle(world.perm("attacker"), world.perm("defender"));
  await entered.promise;
  expect(() => world.combat.getRuntimeState()).toThrow("active combat");
  release.resolve();
  await running;
  expect(world.combat.getRuntimeState().attackSequence).toBe(0);
  expect(() => world.combat.restoreRuntimeState({ attackSequence: -1, attackedThisTurn: new Set() })).toThrow(
    "Invalid",
  );
  expect(world.combat.getRuntimeState().attackSequence).toBe(0);
});
