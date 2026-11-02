import type { PrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/PrimitivesRuntimeState";
import type { GameEngine } from "#api/engine/GameEngine";

export type GameEngineRuntimeState = {
  state: GameEngine["state"];
  primitives: PrimitivesRuntimeState;
  core: ReturnType<GameEngine["getSnapshotCoreState"]>;
  turn: ReturnType<GameEngine["turnMachine"]["getRuntimeState"]>;
  memory: ReturnType<GameEngine["memory"]["snapshot"]>;
  random: readonly [
    ReturnType<NonNullable<GameEngine["randomStreams"]>[0]["snapshot"]>,
    ReturnType<NonNullable<GameEngine["randomStreams"]>[1]["snapshot"]>,
  ];
  tracker: ReturnType<GameEngine["tracker"]["snapshot"]>;
  combat: ReturnType<GameEngine["combat"]["getRuntimeState"]>;
  decisions: ReturnType<GameEngine["decisions"]["getRuntimeState"]>;
  mulligan: ReturnType<GameEngine["mulligan"]["getRuntimeState"]>;
  modifiers: ReturnType<GameEngine["modifiers"]["getRuntimeState"]>;
  continuous: ReturnType<GameEngine["continuous"]["getRuntimeState"]>;
  subTriggers: ReturnType<GameEngine["subTriggers"]["getRuntimeState"]>;
  securityDp: ReturnType<GameEngine["securityDp"]["snapshot"]>;
  deletionMaxDp: ReturnType<GameEngine["deletionMaxDp"]["snapshot"]>;
  dpDeleteBudget: ReturnType<GameEngine["dpDeleteBudget"]["snapshot"]>;
};
