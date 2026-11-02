export type BeliefDeck = {
  id: string;
  archetype: string;
  weight: number;
  mainDeck: readonly string[];
  eggDeck: readonly string[];
};
