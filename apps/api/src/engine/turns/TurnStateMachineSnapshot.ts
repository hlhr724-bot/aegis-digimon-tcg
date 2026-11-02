import type { TurnLoopMode } from "#api/engine/turns/TurnLoopMode";
import type { TurnPhaseFrame } from "#api/engine/turns/TurnPhaseFrame";

export type TurnStateMachineSnapshot = { version: 1; mode: TurnLoopMode; frame: TurnPhaseFrame };
