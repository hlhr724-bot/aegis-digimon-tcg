import type { Primitives } from "#api/engine/effects/EffectContext";
import type { PrimitivesContext } from "#api/engine/effects/verbs/context";

export const primitivesRuntimeContexts = new WeakMap<Primitives, PrimitivesContext>();
