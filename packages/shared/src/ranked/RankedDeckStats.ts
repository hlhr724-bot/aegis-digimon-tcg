export type RankedDeckStats = {
  archetype: string;
  games: number;
  wins: number;
  players: number;
  winrate: number | null;
  coverCardId: string | null;
  colors: string[];
};
