import type { Primitives } from "#api/engine/effects/EffectContext";
import type { ScopedPrimitiveParams } from "#api/engine/effects/scopes/ScopedPrimitiveParams";
import { ScopedPrimitiveKind } from "#api/engine/effects/scopes/ScopedPrimitiveKind";
import { scopedPrimitiveDescriptors } from "#api/engine/effects/scopes/scopedPrimitiveDescriptors";
import { createScopedEffectPrimitives } from "#api/engine/effects/scopes/createScopedEffectPrimitives";
import { describeScopedEffectPrimitives } from "#api/engine/effects/scopes/describeScopedEffectPrimitives";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";

type Params = { objects: RuntimeObjectRegistry };

export function registerScopedPrimitiveFactory({ objects }: Params): void {
  objects.registerFactory({
    key: EngineRuntimeObjectKind.SCOPED_PRIMITIVES.value,
    allocate: () => ({}),
    describe: (value) => describeScopedEffectPrimitives({ value }),
    hydrate: ({ value, payload }) => {
      if (payload === null || typeof payload !== "object") {
        throw new Error("Invalid scoped primitive payload");
      }
      const params = payload as ScopedPrimitiveParams;
      if (
        !Object.values(ScopedPrimitiveKind).some((entry) => entry.value === params.kind) ||
        params.ctx === null ||
        typeof params.ctx !== "object" ||
        params.ctx.fx === null ||
        typeof params.ctx.fx !== "object" ||
        (params.maxPerTurn !== undefined && !Number.isFinite(params.maxPerTurn)) ||
        (params.autoKey !== undefined && typeof params.autoKey !== "string") ||
        (params.kind === ScopedPrimitiveKind.STATIC.value && typeof params.autoKey !== "string")
      ) {
        throw new Error("Invalid scoped primitive payload");
      }
      const fx = createScopedEffectPrimitives(params);
      Object.assign(value, fx);
      scopedPrimitiveDescriptors.set(value as Primitives, { params, fields: new Map(Object.entries(value)) });
    },
  });
}
