import type { DeckLegality } from "#shared/decks/legality";

export type ProviderFormat = { id: string; name: string };
export type ProviderArchetype = {
  id: number;
  name: string;
  slug: string;
  coverCardId?: string;
  deckCount?: number | null;
  playableDeck?: ProviderDetail | null;
  colors: string[];
  share: number | null;
  winRate: number | null;
  pilots: number | null;
};
export type ProviderList = {
  id: number;
  name: string;
  player: string | null;
  date: string | null;
  format: string | null;
  event: string | null;
  placement: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  colors: string[];
  sourceUrl: string;
  coverCardId?: string;
};
export type ProviderFreshness = { collectedAt?: number; stale?: boolean };
export type ProviderPage<T> = ProviderFreshness & { data: T[]; page: number; pages: number; formats: ProviderFormat[] };
export type ProviderDetail = ProviderList &
  ProviderFreshness & {
    externalUrl: string | null;
    mainDeck: string[] | null;
    eggDeck: string[] | null;
    legality: DeckLegality | null;
  };
