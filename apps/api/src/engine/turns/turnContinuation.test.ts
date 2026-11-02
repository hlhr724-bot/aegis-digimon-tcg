import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { GameEngine } from "#api/engine/GameEngine";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { expect, it } from "vitest";
import { EffectTiming, Phase } from "@aegis/shared/schema/enums";
import { GameState, PendingDecision } from "@aegis/shared/schema/GameState";
import { TurnStateMachine, type TurnFlowHooks } from "#api/engine/TurnStateMachine";
import { MainPhaseController } from "#api/engine/MainPhaseController";
import { MemoryGauge } from "#api/engine/MemoryGauge";
import { TurnLoopMode } from "#api/engine/turns/TurnLoopMode";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

type WorldParams = {
  state?: GameState;
  endWindowsBefore?: number;
  postponeCount?: number;
  startMainGate?: Promise<void>;
};

function createGate() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createWorld({
  state = new GameState(),
  endWindowsBefore = 0,
  postponeCount = 0,
  startMainGate,
}: WorldParams = {}) {
  const events: string[] = [];
  const memory = new MemoryGauge(state);
  const main = new MainPhaseController(state, memory);
  const ready: ReturnType<typeof createGate>[] = [];
  let mainEntries = 0;
  let endWindows = endWindowsBefore;
  function getReady(entry: number) {
    ready[entry] ??= createGate();
    return ready[entry];
  }
  const hooks: TurnFlowHooks = {
    beforeTurn: (turn) => {
      events.push(`before/${turn}`);
    },
    fireTiming: async (timing) => {
      events.push(`timing/${timing}`);
      if (timing === EffectTiming.OnStartMainPhase && startMainGate !== undefined) {
        await startMainGate;
      }
      if (timing === EffectTiming.OnEndTurn) {
        endWindows++;
        if (endWindows <= postponeCount) {
          state.memory = 0;
        }
      }
    },
    draw: async () => {
      events.push("draw");
      return 1;
    },
    deckCount: () => 10,
    unsuspendForActivePhase: async () => {
      events.push("unsuspend");
      return [];
    },
    runBreedingPhase: async () => {
      events.push("breeding");
    },
    runMainPhase: (seat) => {
      events.push("input");
      return main.run(seat);
    },
    resumeMainPhase: (seat) => {
      events.push("input");
      return main.run(seat);
    },
    isMainPhaseOpen: () => main.isOpen,
    finalizeMainPhaseEntry: () => {
      events.push("finalize");
      getReady(++mainEntries).resolve();
    },
    isGameOver: () => state.gameOver,
    declareDeckOutLoss: () => {
      state.gameOver = true;
    },
    clearDurations: async (boundary) => {
      events.push(`duration/${boundary}`);
    },
  };
  const machine = new TurnStateMachine(state, hooks, memory, (event) => {
    events.push(`event/${JSON.stringify(event)}`);
  });
  return {
    state,
    events,
    main,
    machine,
    memory,
    waitForMain: (entry: number) => getReady(entry).promise,
    getEndWindows: () => endWindows,
  };
}

function cloneState(state: GameState): GameState {
  const objects = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects });
  const snapshot = encodeRuntimeGraph({ value: state, describeObject: objects.describe.bind(objects) });
  const destination = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects: destination });
  return decodeRuntimeGraph({ snapshot: JSON.parse(JSON.stringify(snapshot)), objects: destination }) as GameState;
}

it("resumes settled Main without repeating turn entry, draw, breeding or start-of-main effects", async () => {
  const original = createWorld();
  original.state.memory = 3;
  original.state.isFirstPlayersFirstTurn = false;
  const running = original.machine.runTurn();
  await original.waitForMain(1);
  const snapshot = JSON.parse(JSON.stringify(original.machine.getRuntimeState()));
  expect(snapshot.mode).toBe(TurnLoopMode.SINGLE_TURN.value);
  const destination = createWorld({ state: cloneState(original.state) });
  const prefix = original.events.length;
  const resumed = destination.machine.resume(snapshot);
  expect(destination.main.isOpen).toBe(true);
  expect(destination.events).toEqual(["input"]);
  expect(destination.machine.getRuntimeState()).toEqual(snapshot);
  expect(original.main.endPhaseRequested(0)).toBe(true);
  expect(() => original.machine.getRuntimeState()).toThrow("settled Main");
  expect(destination.main.endPhaseRequested(0)).toBe(true);
  await Promise.all([running, resumed]);
  expect(destination.events.slice(1)).toEqual(original.events.slice(prefix));
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
  expect(destination.state.phase).toBe(Phase.End);
  expect(destination.state.turnCount).toBe(1);
  expect(destination.state.turnSeat).toBe(0);
  expect(() => destination.machine.getRuntimeState()).toThrow("settled Main");
});

it("resumes a postponed Main with the original phase flags and remaining end-window budget", async () => {
  const original = createWorld({ postponeCount: 1 });
  const running = original.machine.runTurn();
  await original.waitForMain(1);
  expect(original.main.endPhaseRequested(0)).toBe(true);
  await original.waitForMain(2);
  const snapshot = original.machine.getRuntimeState();
  expect(snapshot.frame.mainPhaseRan).toBe(true);
  expect(snapshot.frame.endWindowsRun).toBe(1);
  const destination = createWorld({ state: cloneState(original.state), postponeCount: 1, endWindowsBefore: 1 });
  const prefix = original.events.length;
  const resumed = destination.machine.resume(JSON.parse(JSON.stringify(snapshot)));
  expect(destination.events).toEqual(["input"]);
  expect(destination.machine.getRuntimeState().frame.endWindowsRun).toBe(1);
  original.main.endPhaseRequested(0);
  destination.main.endPhaseRequested(0);
  await Promise.all([running, resumed]);
  expect(destination.events.slice(1)).toEqual(original.events.slice(prefix));
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
  expect(destination.getEndWindows()).toBe(2);
});

it("retains the exhausted postponement budget instead of granting more windows after restore", async () => {
  const original = createWorld({ postponeCount: 1000 });
  const running = original.machine.runTurn();
  await original.waitForMain(1);
  for (let count = 1; count <= 100; count++) {
    expect(original.main.endPhaseRequested(0)).toBe(true);
    await original.waitForMain(count + 1);
  }
  const snapshot = original.machine.getRuntimeState();
  expect(snapshot.frame.endWindowsRun).toBe(100);
  const destination = createWorld({ state: cloneState(original.state), postponeCount: 1000, endWindowsBefore: 100 });
  const prefix = original.events.length;
  const resumed = destination.machine.resume(JSON.parse(JSON.stringify(snapshot)));
  original.main.endPhaseRequested(0);
  destination.main.endPhaseRequested(0);
  await Promise.all([running, resumed]);
  expect(destination.getEndWindows()).toBe(100);
  expect(destination.events.slice(1)).toEqual(original.events.slice(prefix));
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
});

it("continues the full game loop after the restored turn hands off to the opponent", async () => {
  const original = createWorld();
  const running = original.machine.run();
  await original.waitForMain(1);
  const snapshot = original.machine.getRuntimeState();
  expect(snapshot.mode).toBe(TurnLoopMode.GAME.value);
  const destination = createWorld({ state: cloneState(original.state) });
  const prefix = original.events.length;
  const resumed = destination.machine.resume(JSON.parse(JSON.stringify(snapshot)));
  original.main.endPhaseRequested(0);
  destination.main.endPhaseRequested(0);
  await Promise.all([original.waitForMain(2), destination.waitForMain(1)]);
  expect(destination.state.turnSeat).toBe(1);
  expect(destination.state.turnCount).toBe(2);
  expect(destination.events.slice(1)).toEqual(original.events.slice(prefix));
  expect(destination.machine.getRuntimeState().mode).toBe(TurnLoopMode.GAME.value);
  original.state.gameOver = true;
  destination.state.gameOver = true;
  original.main.abort();
  destination.main.abort();
  await Promise.all([running, resumed]);
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
});

it("rejects snapshots before entry settles and rejects stale, pending or overlapping continuations", async () => {
  const entry = createGate();
  const original = createWorld({ startMainGate: entry.promise });
  expect(() => original.machine.getRuntimeState()).toThrow("settled Main");
  const running = original.machine.runTurn();
  expect(() => original.machine.getRuntimeState()).toThrow("settled Main");
  entry.resolve();
  await original.waitForMain(1);
  original.state.pendingDecision = new PendingDecision();
  expect(() => original.machine.getRuntimeState()).toThrow("settled Main");
  original.state.pendingDecision = undefined;
  const snapshot = original.machine.getRuntimeState();
  const destination = createWorld({ state: cloneState(original.state) });
  await expect(destination.machine.resume({ ...snapshot, frame: { ...snapshot.frame, turnCount: 9 } })).rejects.toThrow(
    "mismatched",
  );
  await expect(
    destination.machine.resume({ ...snapshot, frame: { ...snapshot.frame, drawPhaseRan: false } }),
  ).rejects.toThrow("mismatched");
  expect(destination.main.isOpen).toBe(false);
  const resumed = destination.machine.resume(snapshot);
  await expect(destination.machine.resume(snapshot)).rejects.toThrow("active");
  await expect(destination.machine.runTurn()).rejects.toThrow("active");
  await expect(destination.machine.run()).rejects.toThrow("already running");
  original.state.gameOver = true;
  destination.state.gameOver = true;
  original.main.abort();
  destination.main.abort();
  await Promise.all([running, resumed]);
});

it("reopens the production Main controller without leaving phase entry pending or replaying entry timings", async () => {
  const original = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "attacker" }] } });
  original.state.isFirstPlayersFirstTurn = true;
  const running = original.engine.turnMachine.runTurn();
  await advance(original.engine).waitForMainPhase(0);
  const snapshot = original.engine.turnMachine.getRuntimeState();
  const destinationEvents: ServerEvent[] = [];
  const destination = new GameEngine(cloneState(original.state), {
    seed: 1,
    emit: (event) => {
      destinationEvents.push(event);
    },
    requestDecision: () => {
      throw new Error("Unexpected decision in the vanilla continuation");
    },
  });
  const prefix = original.events.length;
  const resumed = destination.turnMachine.resume(JSON.parse(JSON.stringify(snapshot)));
  expect(destination.mainPhase.isOpen).toBe(true);
  expect(destination.mainEntryPending).toBe(false);
  expect(destination.deferredEndPhaseSeat).toBeUndefined();
  expect(destinationEvents).toEqual([]);
  expect(original.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  expect(destination.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await Promise.all([running, resumed]);
  expect(destinationEvents).toEqual(original.events.slice(prefix));
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
  expect(destination.mainPhase.isOpen).toBe(false);
});

it("restores a raised memory threshold before resuming Main on the opponent's side", async () => {
  const original = createWorld();
  original.memory.setTurnEndMinMemory(0, 3);
  original.state.memory = -2;
  const running = original.machine.runTurn();
  await original.waitForMain(1);
  const snapshot = original.machine.getRuntimeState();
  const destination = createWorld({ state: cloneState(original.state) });
  await expect(destination.machine.resume(snapshot)).rejects.toThrow("mismatched");
  destination.memory.restore(JSON.parse(JSON.stringify(original.memory.snapshot())));
  const prefix = original.events.length;
  const resumed = destination.machine.resume(JSON.parse(JSON.stringify(snapshot)));
  expect(destination.main.isOpen).toBe(true);
  original.main.endPhaseRequested(0);
  destination.main.endPhaseRequested(0);
  await Promise.all([running, resumed]);
  expect(destination.events.slice(1)).toEqual(original.events.slice(prefix));
  expect(destination.state.toJSON()).toEqual(original.state.toJSON());
});
