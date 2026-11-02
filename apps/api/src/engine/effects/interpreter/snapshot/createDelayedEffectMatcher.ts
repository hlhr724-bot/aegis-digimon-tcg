import type { EffectContext } from "#api/engine/effects/context/effectContext";

export function createDelayedEffectMatcher(): (context: EffectContext) => boolean {
  return (context) => !context.source.isOwnersTurn();
}
