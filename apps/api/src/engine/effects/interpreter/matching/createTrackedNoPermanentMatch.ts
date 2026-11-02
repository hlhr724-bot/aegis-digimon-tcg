import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";

export function createTrackedNoPermanentMatch(ctx: EffectContext): (permanentId: string) => boolean {
  const registry = ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    return () => false;
  }
  return registry.create<(permanentId: string) => boolean>({
    key: InterpreterCallbackKind.NO_PERMANENT_MATCH.value,
    payload: null,
  });
}
