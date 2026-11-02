import type {
  ResolutionCandidatePayload,
  ResolutionCandidateScope,
} from "#api/engine/effects/resolution/ResolutionCandidateScope";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { GameEngine } from "#api/engine/GameEngine";
import { EngineRuntimeCallbackKind } from "#api/engine/snapshot/context/EngineRuntimeCallbackKind";

type Params = {
  engine: GameEngine;
  scope?: ResolutionCandidateScope;
  permanent?: Permanent;
  transientCandidates?: readonly CardInstance[];
};

export function createResolutionCandidateReader({
  engine,
  scope = { kind: ResolutionCandidateKind.ALL.value },
  permanent,
  transientCandidates,
}: Params): () => readonly CardInstance[] {
  const payload: ResolutionCandidatePayload = { scope, permanent, transientCandidates };
  return engine.runtimeCallbacks.create({ key: EngineRuntimeCallbackKind.RESOLUTION_CANDIDATES.value, payload });
}
