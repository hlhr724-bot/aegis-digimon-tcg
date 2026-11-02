import { restorePrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/restorePrimitivesRuntimeState";
import { GameState } from "@aegis/shared/schema/GameState";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { GameEngine, type GameEngineHooks } from "#api/engine/GameEngine";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import type { GameEngineRuntimeState } from "#api/engine/snapshot/GameEngineRuntimeState";
import type { SnapshotOpenPrompts } from "#api/engine/snapshot/SnapshotOpenPrompts";
import { getEngineCodeFingerprint } from "#api/engine/snapshot/getEngineCodeFingerprint";
import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import { replaySnapshotContinuation } from "#api/engine/snapshot/replaySnapshotContinuation";
import { restoreEngineRandom } from "#api/engine/random/restoreEngineRandom";

type Params = { snapshot: GameEngineSnapshot; hooks: GameEngineHooks };

type RestoredGameEngine = {
  engine: GameEngine;
  completion: Promise<void>;
  ready: Promise<void>;
  redeliverOpenPrompts: () => void;
};

const COMBAT_PROMPT_EVENTS: ReadonlySet<ServerEvent["kind"]> = new Set([
  "blockWindowOpened",
  "counterWindowOpened",
  "alliancePrompt",
  "evadePrompt",
  "barrierPrompt",
]);

export function restoreGameEngine({ snapshot, hooks }: Params): RestoredGameEngine {
  if (snapshot.version !== 1 || snapshot.fingerprint !== getEngineCodeFingerprint()) {
    throw new Error("Incompatible engine snapshot version or code fingerprint");
  }
  const continuation = snapshot.continuation;
  let replaying = continuation !== undefined;
  let progress = 0;
  let events = 0;
  const prompts: SnapshotOpenPrompts = {};
  const engineHooks: GameEngineHooks =
    continuation === undefined
      ? hooks
      : {
          ...hooks,
          emit: (event) => {
            progress++;
            if (!replaying) {
              hooks.emit(event);
              return;
            }
            events++;
            if (event.kind === "attackDeclared") {
              prompts.attack = event;
            }
            if (COMBAT_PROMPT_EVENTS.has(event.kind)) {
              prompts.window = event;
            }
          },
          requestDecision: (seat, request) => {
            progress++;
            if (!replaying) {
              hooks.requestDecision(seat, request);
              return;
            }
            prompts.decision = { seat, request };
          },
          onActionSettled: (seat, intentType) => {
            progress++;
            if (!replaying) {
              hooks.onActionSettled?.(seat, intentType);
            }
          },
        };
  const objects = new RuntimeObjectRegistry();
  registerEngineSchemaFactories({ objects });
  const decoder = new RuntimeGraphDecoder({ snapshot: snapshot.graph, objects });
  const state = decoder.decodeRootField({ key: "state" });
  if (!(state instanceof GameState)) {
    throw new Error("Engine snapshot has no GameState");
  }
  const engine = new GameEngine(state, engineHooks);
  decoder.bindRuntimePorts({
    objects: engine.runtimeObjects,
    references: engine.runtimeReferences,
    createCallback: (descriptor) => engine.runtimeCallbacks.create(descriptor),
  });
  const runtime = decoder.decodeRoot() as GameEngineRuntimeState;
  engine.restoreSnapshotCoreState(runtime.core);
  restorePrimitivesRuntimeState({ primitives: engine.primitives, state: runtime.primitives });
  engine.memory.restore(runtime.memory);
  restoreEngineRandom({ engine, snapshots: runtime.random });
  engine.tracker.restore(runtime.tracker);
  engine.combat.restoreRuntimeState(runtime.combat);
  engine.decisions.restoreRuntimeState(runtime.decisions);
  engine.mulligan.restoreRuntimeState(runtime.mulligan);
  engine.modifiers.restoreRuntimeState(runtime.modifiers);
  engine.continuous.restoreRuntimeState(runtime.continuous);
  engine.subTriggers.restoreRuntimeState(runtime.subTriggers);
  engine.securityDp.restore(runtime.securityDp);
  engine.deletionMaxDp.restore(runtime.deletionMaxDp);
  engine.dpDeleteBudget.restore(runtime.dpDeleteBudget);
  const completion = engine.turnMachine.resume(runtime.turn);
  if (continuation === undefined) {
    return { engine, completion, ready: Promise.resolve(), redeliverOpenPrompts: () => {} };
  }
  const ready = replaySnapshotContinuation({
    engine,
    continuation,
    progress: () => progress,
    events: () => events,
  }).finally(() => {
    replaying = false;
  });
  return {
    engine,
    completion,
    ready,
    redeliverOpenPrompts: () => {
      redeliverOpenPrompts({ engine, hooks, prompts });
    },
  };
}

type RedeliverParams = { engine: GameEngine; hooks: GameEngineHooks; prompts: SnapshotOpenPrompts };

function redeliverOpenPrompts({ engine, hooks, prompts }: RedeliverParams): void {
  if (engine.state.combatWindow !== undefined) {
    if (prompts.attack !== undefined) {
      hooks.emit(prompts.attack);
    }
    if (prompts.window !== undefined) {
      hooks.emit(prompts.window);
    }
  }
  const pending = engine.state.pendingDecision;
  if (pending !== undefined && prompts.decision?.request.decisionId === pending.decisionId) {
    hooks.requestDecision(prompts.decision.seat, prompts.decision.request);
  }
}
