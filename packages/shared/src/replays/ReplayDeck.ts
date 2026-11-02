import type { UsedDeck } from "#shared/decks/UsedDeck";

export type ReplayDeck = Pick<UsedDeck, "deckName" | "mainDeck" | "eggDeck" | "mainDeckArts" | "eggDeckArts">;
export type ReplayDecks = [ReplayDeck | null, ReplayDeck | null];
