import type { Decklist } from "#api/engine/setup";

export type MatchupOpponent = {
  name: string;
  deck: Decklist;
  communityDeckId?: string;
  coverCardId?: string;
  colors?: readonly string[];
};
