import type { Effect } from "#api/engine/effects/Effect";
import type { RuntimeEffectSnapshot } from "#api/engine/effects/interpreter/snapshot/RuntimeEffectSnapshot";

export const runtimeEffectSnapshots = new WeakMap<Effect, RuntimeEffectSnapshot>();
