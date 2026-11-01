import { Side } from "@/game/side";

type Params = {
  side: Side;
  activeSide: number;
  time: number;
  reducedMotion: boolean;
};

const RESTING_AURA = 0.1;
const ACTIVE_AURA = 0.18;
const BREATH_DEPTH = 0.15;
const BREATH_SPEED = 0.6;

export function getArenaAuraTarget({ side, activeSide, time, reducedMotion }: Params): number {
  const active = side === Side.Viewer ? activeSide > 0 : activeSide < 0;
  const base = active ? ACTIVE_AURA : RESTING_AURA;
  if (reducedMotion) {
    return base;
  }
  return base * (1 - BREATH_DEPTH * (0.5 + 0.5 * Math.sin(time * BREATH_SPEED)));
}
