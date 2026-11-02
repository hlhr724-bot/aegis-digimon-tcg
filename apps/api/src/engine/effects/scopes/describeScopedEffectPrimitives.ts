import type { Primitives } from "#api/engine/effects/EffectContext";
import type { ScopedPrimitiveParams } from "#api/engine/effects/scopes/ScopedPrimitiveParams";
import { scopedPrimitiveDescriptors } from "#api/engine/effects/scopes/scopedPrimitiveDescriptors";

type Params = { value: object };

export function describeScopedEffectPrimitives({ value }: Params): ScopedPrimitiveParams {
  const descriptor = scopedPrimitiveDescriptors.get(value as Primitives);
  if (descriptor === undefined || Reflect.ownKeys(value).length !== descriptor.fields.size) {
    throw new Error("Unknown or modified scoped primitives");
  }
  for (const [key, expected] of descriptor.fields) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (field === undefined || !("value" in field) || field.value !== expected) {
      throw new Error("Unknown or modified scoped primitives");
    }
  }
  return descriptor.params;
}
