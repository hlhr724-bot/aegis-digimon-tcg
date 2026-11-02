import type { ArenaFieldEffectMark } from "@/game/arena3d/slots/ArenaFieldEffectMark";
import { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";

type Params = {
  previous: readonly ArenaFieldEffectMark[];
  next: readonly ArenaFieldEffectMark[];
};

function countKeys(marks: readonly ArenaFieldEffectMark[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const mark of marks) {
    counts.set(mark.key, (counts.get(mark.key) ?? 0) + 1);
  }
  return counts;
}

export function findArenaFieldEffectArrival({ previous, next }: Params): ArenaFieldEffectTone {
  const remaining = countKeys(previous);
  let arrived = false;
  for (const mark of next) {
    const count = remaining.get(mark.key) ?? 0;
    if (count > 0) {
      remaining.set(mark.key, count - 1);
      continue;
    }
    if (mark.harmful) {
      return ArenaFieldEffectTone.HARMFUL.value;
    }
    arrived = true;
  }
  return arrived ? ArenaFieldEffectTone.HELPFUL.value : ArenaFieldEffectTone.NONE.value;
}
