import type { ArenaLateGap } from "@/game/arena3d/quality/ArenaLateGap";

type Params = {
  gaps: readonly ArenaLateGap[];
  since: number;
  overlapsLongTask: (start: number, end: number) => boolean;
};

export function countArenaRenderLateFrames({ gaps, since, overlapsLongTask }: Params): number {
  let count = 0;
  for (const gap of gaps) {
    if (gap.end >= since && !overlapsLongTask(gap.start, gap.end)) {
      count += 1;
    }
  }
  return count;
}
