import { ARENA_FIELD_EFFECT_AURA_TIMING } from "@/game/arena3d/fieldEffects/arenaFieldEffectAuraTiming";

type Params = {
  current: number;
  active: boolean;
  delta: number;
};

export function stepArenaFieldEffectWeight({ current, active, delta }: Params): number {
  const target = active ? 1 : 0;
  const rate = active ? ARENA_FIELD_EFFECT_AURA_TIMING.fadeInRate : ARENA_FIELD_EFFECT_AURA_TIMING.fadeOutRate;
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}
