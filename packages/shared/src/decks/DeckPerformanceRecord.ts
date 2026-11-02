import type { MatchWinRate } from "#shared/replays";

export interface DeckPerformanceRecord {
  deckId: string;
  name: string;
  stats: MatchWinRate;
}
