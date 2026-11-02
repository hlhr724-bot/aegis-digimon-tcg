import type { DeckFormat } from "#shared/deckFormat";
import type { MatchBestOf } from "#shared/matchFormat";
import type { MatchQueue } from "#shared/matchmaking/MatchQueue";

export type MatchQueueSelection = {
  queue: MatchQueue;
  format: DeckFormat;
  matchTimer: boolean;
  bestOf: MatchBestOf;
  allowRollback: boolean;
};
