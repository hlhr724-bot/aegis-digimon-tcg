import type { ArenaFocus } from "@/game/arena3d/cues/ArenaCardCue";

type Params = {
  focus: ArenaFocus;
  targetId: string | undefined;
  delta: number;
  reducedMotion: boolean;
};

const FADE_IN_RATE = 9;
const FADE_OUT_RATE = 5;

export function easeArenaFocus({ focus, targetId, delta, reducedMotion }: Params): ArenaFocus {
  const target = targetId ? 1 : 0;
  const permanentId = targetId ?? focus.permanentId;
  if (reducedMotion) {
    return { permanentId, level: target };
  }
  const rate = target > focus.level ? FADE_IN_RATE : FADE_OUT_RATE;
  const level = focus.level + (target - focus.level) * (1 - Math.exp(-rate * delta));
  return { permanentId: level < 0.002 && !targetId ? undefined : permanentId, level: level < 0.002 ? 0 : level };
}
