import type { CompiledCard } from "@aegis/shared/effects/ir/card";

type Params = { compiled: CompiledCard };

export function freezeCompiledCard({ compiled }: Params): CompiledCard {
  const visited = new WeakSet<object>();
  freezeValue(compiled);
  return compiled;

  function freezeValue(value: unknown): void {
    if (value === null || typeof value !== "object" || visited.has(value)) {
      return;
    }
    visited.add(value);
    for (const child of Object.values(value)) {
      freezeValue(child);
    }
    Object.freeze(value);
  }
}
