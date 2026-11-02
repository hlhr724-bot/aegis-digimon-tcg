import type { CardDefinition } from "@aegis/shared/cards/types";
import { createTamerAsDigimonMatch } from "#api/engine/effects/interpreter/matching/createTamerAsDigimonMatch";
import type { TamerAsDigimonMatchParams } from "#api/engine/effects/interpreter/matching/TamerAsDigimonMatchParams";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

export function createTrackedTamerAsDigimonMatch(
  params: TamerAsDigimonMatchParams,
): (permanentId: string, asDigimon: CardDefinition) => boolean {
  const registry = params.ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    return createTamerAsDigimonMatch(params);
  }
  params.ctx.game?.runtimeObjects?.track({ value: params.ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  return registry.create<(permanentId: string, asDigimon: CardDefinition) => boolean>({
    key: InterpreterCallbackKind.TAMER_AS_DIGIMON_MATCH.value,
    payload: params,
  });
}
