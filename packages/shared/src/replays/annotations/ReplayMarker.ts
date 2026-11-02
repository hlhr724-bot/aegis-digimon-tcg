import type { ReplayMarkerEmoji } from "#shared/replays/annotations/ReplayMarkerEmoji";

export type ReplayMarker = {
  id: string;
  matchId: string;
  frameIndex: number;
  turn: number;
  emoji: ReplayMarkerEmoji;
  createdAt: number;
};
