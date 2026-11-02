import { RIPPLE_LIFETIME_SECONDS, SWEEP_SECONDS } from "@/game/arena3d/arenaSceneLayout";
import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";

type Params = {
  buffer: ArenaRippleBuffer;
  time: number;
};

function isLive(age: number, lifetime: number): boolean {
  return age >= 0 && age < lifetime;
}

export function isArenaRippleActive({ buffer, time }: Params): boolean {
  if (isLive(time - buffer.sweepStart, SWEEP_SECONDS)) {
    return true;
  }
  return buffer.ripples.some((ripple) => ripple.w > 0 && isLive(time - ripple.z, RIPPLE_LIFETIME_SECONDS));
}
