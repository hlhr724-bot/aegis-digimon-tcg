import type { Primitives } from "#api/engine/effects/EffectContext";
import type { ScopedPrimitiveParams } from "#api/engine/effects/scopes/ScopedPrimitiveParams";

export const scopedPrimitiveDescriptors = new WeakMap<
  Primitives,
  { params: ScopedPrimitiveParams; fields: Map<string, unknown> }
>();
