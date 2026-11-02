import { ARENA_FIELD_EFFECT_AURA_TIMING } from "@/game/arena3d/fieldEffects/arenaFieldEffectAuraTiming";

export function getArenaFieldEffectArrivalStrength(age: number): number {
  const { arrivalRiseSeconds, arrivalSeconds } = ARENA_FIELD_EFFECT_AURA_TIMING;
  if (age < 0 || age >= arrivalSeconds) {
    return 0;
  }
  const rise = Math.min(1, age / arrivalRiseSeconds);
  const remaining = 1 - Math.max(0, age - arrivalRiseSeconds) / (arrivalSeconds - arrivalRiseSeconds);
  return rise * remaining * remaining;
}
