import type { FieldEffectView } from "@aegis/shared";

export function isHarmfulFieldEffect(effect: FieldEffectView): boolean {
  return effect.kind === "restriction" || (effect.kind === "dp" && Number(effect.value) < 0);
}
