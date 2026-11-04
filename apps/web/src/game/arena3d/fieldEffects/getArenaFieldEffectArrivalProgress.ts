import { ARENA_FIELD_EFFECT_AURA_TIMING } from "@/game/arena3d/fieldEffects/arenaFieldEffectAuraTiming";

export function getArenaFieldEffectArrivalProgress(age: number): number {
  const linear = Math.min(1, Math.max(0, age / ARENA_FIELD_EFFECT_AURA_TIMING.arrivalTravelSeconds));
  return 1 - (1 - linear) ** 3;
}
