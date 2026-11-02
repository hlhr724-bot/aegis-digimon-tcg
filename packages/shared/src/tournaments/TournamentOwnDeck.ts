export type TournamentOwnDeck = {
  available?: boolean;
  savedDeckId: string | null;
  locked: boolean;
  name: string;
  mainDeck: string[];
  eggDeck: string[];
  revision: number;
};
