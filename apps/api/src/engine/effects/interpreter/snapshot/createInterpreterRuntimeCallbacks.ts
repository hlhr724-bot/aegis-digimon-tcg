import { createCostReplacementCallback } from "#api/engine/effects/interpreter/replacements/createCostReplacementCallback";
import { createLeaveReplacementCallback } from "#api/engine/effects/interpreter/replacements/createLeaveReplacementCallback";
import { createCostModifierCallback } from "#api/engine/effects/interpreter/costModifiers/createCostModifierCallback";
import { createPermanentFilterMatchCallback } from "#api/engine/effects/interpreter/matching/createPermanentFilterMatchCallback";
import { createTamerAsDigimonMatchCallback } from "#api/engine/effects/interpreter/matching/createTamerAsDigimonMatchCallback";
import { createGrantActivityCallback } from "#api/engine/effects/interpreter/matching/createGrantActivityCallback";
import { createSubTriggerCallback } from "#api/engine/effects/interpreter/subtriggers/createSubTriggerCallback";
import { EffectActivationCallbackKind } from "#api/engine/effects/EffectActivationCallbackKind";
import { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { createDelayedEffectBody } from "#api/engine/effects/interpreter/snapshot/createDelayedEffectBody";
import { createDelayedEffectMatcher } from "#api/engine/effects/interpreter/snapshot/createDelayedEffectMatcher";
import type { DelayedEffectPayload } from "#api/engine/effects/interpreter/snapshot/DelayedEffectPayload";

export function createInterpreterRuntimeCallbacks(): RuntimeCallbackRegistry {
  const registry = new RuntimeCallbackRegistry();
  registry.registerFactory({
    key: InterpreterCallbackKind.COST_REPLACEMENT.value,
    create: createCostReplacementCallback,
  });
  registry.registerFactory({ key: InterpreterCallbackKind.SUBTRIGGER.value, create: createSubTriggerCallback });
  registry.registerFactory({ key: InterpreterCallbackKind.COST_MODIFIER.value, create: createCostModifierCallback });
  registry.registerFactory({ key: InterpreterCallbackKind.GRANT_ACTIVITY.value, create: createGrantActivityCallback });
  registry.registerFactory({
    key: InterpreterCallbackKind.PERMANENT_FILTER_MATCH.value,
    create: createPermanentFilterMatchCallback,
  });
  registry.registerFactory({
    key: InterpreterCallbackKind.TAMER_AS_DIGIMON_MATCH.value,
    create: createTamerAsDigimonMatchCallback,
  });
  registry.registerFactory({
    key: InterpreterCallbackKind.NO_PERMANENT_MATCH.value,
    create: (payload) => {
      if (payload !== null) {
        throw new Error("Invalid no-permanent match payload");
      }
      return () => false;
    },
  });
  registry.registerFactory({
    key: InterpreterCallbackKind.LEAVE_REPLACEMENT.value,
    create: createLeaveReplacementCallback,
  });
  registry.registerFactory({
    key: EffectActivationCallbackKind.ACCEPTED.value,
    create: (payload) => {
      if (payload !== null) {
        throw new Error("Invalid completed activation receipt");
      }
      return () => {};
    },
  });
  registry.registerFactory({
    key: EffectActivationCallbackKind.NOT_PENDING.value,
    create: (payload) => {
      if (payload !== null) {
        throw new Error("Invalid completed activation receipt");
      }
      return () => false;
    },
  });
  registry.registerFactory({
    key: InterpreterCallbackKind.DELAYED_MATCH.value,
    create: () => createDelayedEffectMatcher(),
  });
  registry.registerFactory({
    key: InterpreterCallbackKind.DELAYED_BODY.value,
    create: (payload) => {
      if (!isDelayedEffectPayload(payload)) {
        throw new Error("Invalid delayed-effect callback payload");
      }
      return createDelayedEffectBody(payload);
    },
  });
  return registry;
}

function isDelayedEffectPayload(value: unknown): value is DelayedEffectPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as DelayedEffectPayload;
  if (
    payload.effect === null ||
    typeof payload.effect !== "object" ||
    typeof payload.effect.kind !== "string" ||
    payload.bindings === null ||
    typeof payload.bindings !== "object"
  ) {
    return false;
  }
  return Object.values(payload.bindings).every((entry) => entry === undefined || entry instanceof Map);
}
