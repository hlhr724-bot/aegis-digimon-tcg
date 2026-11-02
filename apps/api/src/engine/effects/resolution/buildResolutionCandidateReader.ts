import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { GameEngine } from "#api/engine/GameEngine";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";
import type { ResolutionCandidatePayload } from "#api/engine/effects/resolution/ResolutionCandidateScope";
import {
  candidateSourceLocation,
  collectPermanentInstances,
  instancesById,
  listCandidateInstances,
} from "#api/engine/gameEngine/ruleProcess";

type Params = { engine: GameEngine; payload: ResolutionCandidatePayload };

export function buildResolutionCandidateReader({ engine, payload }: Params): () => readonly CardInstance[] {
  const scope = payload.scope;
  if (scope.kind === ResolutionCandidateKind.PERMANENT.value && scope.resident && payload.permanent === undefined) {
    payload.permanent = engine.access.permanentById(scope.permanentId);
    if (payload.permanent === undefined) {
      throw new Error("Resolution candidate permanent is missing from destination state");
    }
  }
  const capturedPermanent = payload.permanent;
  const readLive = (): readonly CardInstance[] => {
    switch (scope.kind) {
      case ResolutionCandidateKind.ALL.value:
        return listCandidateInstances(engine);
      case ResolutionCandidateKind.NONE.value:
        return [];
      case ResolutionCandidateKind.INSTANCES.value:
        return instancesById(engine, scope.instanceIds);
      case ResolutionCandidateKind.BOUNDARY.value:
        return instancesById(engine, [...scope.locations.keys()]).filter(
          (instance) =>
            candidateSourceLocation(engine, instance.instanceId) === scope.locations.get(instance.instanceId),
        );
      case ResolutionCandidateKind.PERMANENT.value: {
        if (capturedPermanent === undefined || engine.access.permanentById(scope.permanentId) !== capturedPermanent) {
          return [];
        }
        const candidates: CardInstance[] = [];
        collectPermanentInstances(engine, capturedPermanent, candidates);
        const wanted = new Set(scope.instanceIds);
        return candidates.filter((instance) => wanted.has(instance.instanceId));
      }
    }
  };
  const transientCandidates = payload.transientCandidates;
  if (transientCandidates === undefined) {
    return readLive;
  }
  return () => {
    const candidates = new Map(readLive().map((instance) => [instance.instanceId, instance] as const));
    for (const instance of transientCandidates) {
      candidates.set(instance.instanceId, instance);
    }
    return [...candidates.values()];
  };
}
