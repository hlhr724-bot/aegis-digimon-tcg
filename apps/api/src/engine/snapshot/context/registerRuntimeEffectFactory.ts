import { EffectTiming } from "@aegis/shared/schema/enums";
import type { CardEffect } from "@aegis/shared/effects/ir/card";
import type { CardSource } from "#api/engine/effects/CardSource";
import type { Effect } from "#api/engine/effects/Effect";
import { getEffectModule } from "#api/engine/effects/registry";
import { runtimeEffectSnapshots } from "#api/engine/effects/interpreter/snapshot/runtimeEffectSnapshots";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { objects: RuntimeObjectRegistry };
type Payload = {
  cardId: string;
  timing: EffectTiming;
  index: number;
  source: CardSource;
  definition: CardEffect;
  attributes: Record<string, unknown>;
};
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function registerRuntimeEffectFactory({ objects }: Params): void {
  objects.registerFactory({
    key: EngineRuntimeObjectKind.IR_EFFECT.value,
    allocate: () => ({}),
    describe: (value) => {
      const effect = value as Effect;
      if (Object.getOwnPropertySymbols(effect).length > 0) {
        throw new Error("Runtime effect contains unsupported symbols");
      }
      const metadata = runtimeEffectSnapshots.get(effect);
      if (metadata === undefined) {
        throw new Error("Runtime effect has no IR provenance");
      }
      const attributes: Record<string, unknown> = {};
      const methods = new Set<string>();
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(effect))) {
        if (descriptor.get !== undefined || descriptor.set !== undefined || FORBIDDEN_KEYS.has(key)) {
          throw new Error("Runtime effect contains unsupported properties");
        }
        if (typeof descriptor.value === "function") {
          if (metadata.methods.get(key) !== descriptor.value) {
            throw new Error("Runtime effect requires a specialized callback descriptor");
          }
          methods.add(key);
        } else {
          attributes[key] = descriptor.value;
        }
      }
      if (methods.size !== metadata.methods.size) {
        throw new Error("Runtime effect methods changed after creation");
      }
      return {
        cardId: metadata.cardId,
        timing: metadata.timing,
        index: metadata.index,
        source: metadata.source,
        definition: metadata.definition,
        attributes,
      };
    },
    hydrate: ({ value, payload }) => {
      if (!isPayload(payload)) {
        throw new Error("Invalid runtime effect payload");
      }
      const effect = getEffectModule(payload.cardId)?.effectsForTiming(payload.timing, payload.source)[payload.index];
      const metadata = effect === undefined ? undefined : runtimeEffectSnapshots.get(effect);
      if (effect === undefined || metadata === undefined || metadata.definition !== payload.definition) {
        throw new Error("Runtime effect definition does not match installed IR");
      }
      for (const key of Object.keys(payload.attributes)) {
        if (FORBIDDEN_KEYS.has(key) || metadata.methods.has(key) || typeof payload.attributes[key] === "function") {
          throw new Error("Invalid runtime effect attribute override");
        }
      }
      for (const [key, method] of metadata.methods) {
        Object.defineProperty(value, key, { value: method, writable: true, enumerable: true, configurable: true });
      }
      for (const [key, entry] of Object.entries(payload.attributes)) {
        Object.defineProperty(value, key, { value: entry, writable: true, enumerable: true, configurable: true });
      }
      runtimeEffectSnapshots.set(value as Effect, metadata);
    },
  });
}

function isPayload(value: unknown): value is Payload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as Payload;
  return (
    typeof payload.cardId === "string" &&
    typeof payload.timing === "number" &&
    Object.values(EffectTiming).includes(payload.timing) &&
    Number.isSafeInteger(payload.index) &&
    payload.index >= 0 &&
    payload.source !== null &&
    typeof payload.source === "object" &&
    typeof payload.source.permanent === "function" &&
    payload.definition !== null &&
    typeof payload.definition === "object" &&
    payload.attributes !== null &&
    typeof payload.attributes === "object" &&
    !Array.isArray(payload.attributes) &&
    isEffectAttributes(payload.attributes)
  );
}

function isEffectAttributes(attributes: Record<string, unknown>): boolean {
  return (
    typeof attributes.effectKey === "string" &&
    typeof attributes.description === "string" &&
    typeof attributes.optional === "boolean" &&
    typeof attributes.isInherited === "boolean" &&
    typeof attributes.isSecurity === "boolean" &&
    typeof attributes.isLinked === "boolean" &&
    typeof attributes.maxPerTurn === "number" &&
    Number.isFinite(attributes.maxPerTurn)
  );
}
