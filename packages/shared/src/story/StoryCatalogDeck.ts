export type StoryCatalogDeck = {
  readonly name: string;
  readonly resultId: number;
  readonly eventDate: string;
  readonly format: string;
  readonly country?: string | null;
  readonly hash: string;
  readonly main: readonly (readonly [string, number])[];
  readonly eggs: readonly (readonly [string, number])[];
};
