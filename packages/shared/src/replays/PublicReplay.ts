import type { DeckFormat } from "#shared/deckFormat";
import type { ReplaySummary } from "#shared/replays";
import type { ReplayViewerSeat } from "#shared/replays/ReplayViewerSeat";

export const PUBLIC_REPLAY_PAGE_SIZE = 20;
export const MAX_PUBLIC_REPLAY_PAGE_SIZE = 50;

export type PublicReplay = {
  id: string;
  summary: ReplaySummary;
  viewerSeat: ReplayViewerSeat;
  format?: DeckFormat;
  savedAt: number;
};

export type PublicReplayPage = {
  replays: PublicReplay[];
  nextCursor?: string;
};
