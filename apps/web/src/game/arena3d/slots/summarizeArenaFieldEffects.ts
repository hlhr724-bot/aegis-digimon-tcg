import type { FieldEffectView } from "@aegis/shared";
import type { ArenaFieldEffectState } from "@/game/arena3d/slots/ArenaFieldEffectState";

function isHarmful(effect: FieldEffectView): boolean {
  return effect.kind === "restriction" || (effect.kind === "dp" && Number(effect.value) < 0);
}

export function summarizeArenaFieldEffects(effects: readonly FieldEffectView[]): ArenaFieldEffectState {
  return { active: effects.length > 0, harmful: effects.some(isHarmful) };
}
