import type { Primitives } from "#api/engine/effects/EffectContext";
import type { PrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/PrimitivesRuntimeState";
import { primitivesRuntimeContexts } from "#api/engine/effects/verbs/snapshot/primitivesRuntimeContexts";

type Params = { primitives: Primitives };

export function getPrimitivesRuntimeState({ primitives }: Params): PrimitivesRuntimeState {
  const context = primitivesRuntimeContexts.get(primitives);
  if (context === undefined) {
    throw new Error("Unregistered primitives runtime context");
  }
  if (
    context.effectSeatStack.length !== 0 ||
    context.effectSourceKindsStack.length !== 0 ||
    context.effectSourcePermanentIdStack.length !== 0 ||
    context.effectTargetsEmittedStack.length !== 0
  ) {
    throw new Error("Cannot snapshot active primitive effect scope");
  }
  return {
    ...context.sequences,
    digiXrosZoneExpansions: context.digiXrosZoneExpansions,
    customGrants: context.customGrants,
  };
}
