type Params = {
  level: number;
  active: boolean;
  delta: number;
  reducedMotion: boolean;
};

const FADE_SECONDS = 0.18;
const LONGEST_STEP_SECONDS = 1 / 30;

export function stepArenaBreedingFocus({ level, active, delta, reducedMotion }: Params): number {
  const target = active ? 1 : 0;
  if (reducedMotion) {
    return target;
  }
  const step = Math.min(Math.max(delta, 0), LONGEST_STEP_SECONDS) / FADE_SECONDS;
  return target > level ? Math.min(target, level + step) : Math.max(target, level - step);
}
