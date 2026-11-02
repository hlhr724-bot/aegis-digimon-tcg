type Params = {
  mainDeck: readonly string[];
  eggDeck: readonly string[];
  format?: string;
};

export function buildDeckCompositionKey({ mainDeck, eggDeck, format }: Params): string {
  return JSON.stringify([[...mainDeck].sort(), [...eggDeck].sort(), format ?? "standard"]);
}
