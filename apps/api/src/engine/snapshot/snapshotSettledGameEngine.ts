import { getPrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/getPrimitivesRuntimeState";
import type { GameEngine } from "#api/engine/GameEngine";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import { assertEngineSnapshotBoundary } from "#api/engine/snapshot/assertEngineSnapshotBoundary";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { getEngineCodeFingerprint } from "#api/engine/snapshot/getEngineCodeFingerprint";
import { snapshotEngineRandom } from "#api/engine/random/snapshotEngineRandom";

type Params = { engine: GameEngine };

export function snapshotSettledGameEngine({ engine }: Params): GameEngineSnapshot {
  if (!engine.runtimeObjects.snapshotsEnabled) {
    throw new Error("Engine snapshots are disabled for this rollout engine");
  }
  assertEngineSnapshotBoundary({ engine });
  const value = {
    state: engine.state,
    primitives: getPrimitivesRuntimeState({ primitives: engine.primitives }),
    core: engine.getSnapshotCoreState(),
    turn: engine.turnMachine.getRuntimeState(),
    memory: engine.memory.snapshot(),
    random: snapshotEngineRandom({ engine }),
    tracker: engine.tracker.snapshot(),
    combat: engine.combat.getRuntimeState(),
    decisions: engine.decisions.getRuntimeState(),
    mulligan: engine.mulligan.getRuntimeState(),
    modifiers: engine.modifiers.getRuntimeState(),
    continuous: engine.continuous.getRuntimeState(),
    subTriggers: engine.subTriggers.getRuntimeState(),
    securityDp: engine.securityDp.snapshot(),
    deletionMaxDp: engine.deletionMaxDp.snapshot(),
    dpDeleteBudget: engine.dpDeleteBudget.snapshot(),
  };
  return {
    version: 1,
    fingerprint: getEngineCodeFingerprint(),
    graph: encodeRuntimeGraph({
      value,
      describeObject: (entry) => engine.runtimeObjects.describe(entry),
      describeCallback: (callback) => engine.runtimeCallbacks.describe(callback),
      references: engine.runtimeReferences,
    }),
  };
}
