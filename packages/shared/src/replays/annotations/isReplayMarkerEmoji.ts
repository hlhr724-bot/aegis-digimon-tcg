import { ReplayMarkerEmoji } from "#shared/replays/annotations/ReplayMarkerEmoji";

export function isReplayMarkerEmoji(value: unknown): value is ReplayMarkerEmoji {
  return typeof value === "string" && Object.values(ReplayMarkerEmoji).some((entry) => entry.value === value);
}
