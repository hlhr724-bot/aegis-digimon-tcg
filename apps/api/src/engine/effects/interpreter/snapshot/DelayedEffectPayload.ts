import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { EffectContext } from "#api/engine/effects/context/effectContext";

export type DelayedEffectPayload = {
  effect: Action;
  bindings: Pick<EffectContext, "boundPlayed" | "boundCardInstances" | "selections" | "namedCounts">;
};
