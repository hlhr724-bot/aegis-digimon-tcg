import type { RankedDeckResult } from "#shared/ranked/RankedDeckResult";

export type RankedDeckMatch = {
  matchId: string;
  opponentName: string;
  result: RankedDeckResult;
  finishedAt: number;
  ratingChange: number | null;
};

export type RankedPlayerDeck = {
  id: string;
  name: string;
  archetype: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
  lastPlayedAt: number;
  publicDeckId: string | null;
  list: { mainDeck: string[]; eggDeck: string[] } | null;
  history: RankedDeckMatch[];
};
