import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { Primitives } from "#api/engine/effects/EffectContext";
import type { ScopedPrimitiveParams } from "#api/engine/effects/scopes/ScopedPrimitiveParams";
import { ScopedPrimitiveKind } from "#api/engine/effects/scopes/ScopedPrimitiveKind";
import { scopedPrimitiveDescriptors } from "#api/engine/effects/scopes/scopedPrimitiveDescriptors";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

export function createScopedEffectPrimitives(params: ScopedPrimitiveParams): Primitives {
  const { ctx, kind, autoKey, maxPerTurn } = params;
  let fx: Primitives;
  if (kind === ScopedPrimitiveKind.STATIC.value) {
    fx = {
      ...ctx.fx,
      // Static keyword grants belong to the continuously re-derived tier by construction.
      // Mark them explicitly so an overlapping triggered resolution cannot toggle the engine's
      // ambient continuous-mode flag and accidentally make the grant permanent or erase it.
      grantKeyword: (...args: Parameters<EffectContext["fx"]["grantKeyword"]>) => {
        const [permanentId, keyword, duration, amount, grantOpts] = args;
        return ctx.fx.grantKeyword(permanentId, keyword, duration, amount, {
          ...grantOpts,
          continuous: true,
        });
      },
      subscribeSubTrigger: (sub: Parameters<EffectContext["fx"]["subscribeSubTrigger"]>[0]) =>
        ctx.fx.subscribeSubTrigger({
          ...sub,
          continuous: sub.continuous ?? true,
          ...(maxPerTurn !== undefined && maxPerTurn >= 1 ? { oncePerTurnKey: sub.oncePerTurnKey ?? autoKey } : {}),
        }),
      changeEvoCost: (
        filter: Parameters<EffectContext["fx"]["changeEvoCost"]>[0],
        delta: number,
        changeOpts: Parameters<EffectContext["fx"]["changeEvoCost"]>[2],
      ) =>
        ctx.fx.changeEvoCost(filter, delta, {
          ...changeOpts,
          continuous: true,
        }),
      modifyDP: (
        permanentId: Parameters<EffectContext["fx"]["modifyDP"]>[0],
        delta: Parameters<EffectContext["fx"]["modifyDP"]>[1],
        duration: Parameters<EffectContext["fx"]["modifyDP"]>[2],
        modifyOpts: Parameters<EffectContext["fx"]["modifyDP"]>[3],
      ) =>
        ctx.fx.modifyDP(permanentId, delta, duration, {
          ...modifyOpts,
          continuous: true,
        }),
      subscribeReplacement: (replacement: Parameters<EffectContext["fx"]["subscribeReplacement"]>[0]) =>
        ctx.fx.subscribeReplacement({
          ...replacement,
          ...(maxPerTurn !== undefined && maxPerTurn >= 1
            ? { oncePerTurnKey: replacement.oncePerTurnKey ?? autoKey }
            : {}),
        }),
      restrict: (
        permanentId: Parameters<EffectContext["fx"]["restrict"]>[0],
        restriction: Parameters<EffectContext["fx"]["restrict"]>[1],
        duration: Parameters<EffectContext["fx"]["restrict"]>[2],
        restrictOpts: Parameters<EffectContext["fx"]["restrict"]>[3],
      ) =>
        ctx.fx.restrict(permanentId, restriction, duration, {
          ...restrictOpts,
          continuous: true,
        }),
    };
  } else if (kind === ScopedPrimitiveKind.EVOLUTION_COST.value) {
    fx = {
      ...ctx.fx,
      changeEvoCost: (filter, delta, options) => ctx.fx.changeEvoCost(filter, delta, { ...options, continuous: true }),
    };
  } else if (kind === ScopedPrimitiveKind.SECURITY.value) {
    fx = {
      ...ctx.fx,
      modifyDP: (permanentId, delta, duration, options) =>
        ctx.fx.modifyDP(permanentId, delta, duration, { ...options, continuous: true }),
    };
  } else {
    throw new Error("Unknown scoped primitive kind");
  }
  scopedPrimitiveDescriptors.set(fx, { params, fields: new Map(Object.entries(fx)) });
  ctx.game?.runtimeObjects?.track({ value: ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  ctx.game?.runtimeObjects?.track({ value: fx, key: EngineRuntimeObjectKind.SCOPED_PRIMITIVES.value });
  return fx;
}
