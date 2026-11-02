import type { DeckListing } from "@/game/decks";
import type { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import { convertDeckCardLanguage } from "@/screens/cardLanguage/convertDeckCardLanguage";

type Params = {
  decks: readonly DeckListing[];
  language: CardImageLanguage;
  saveDeck: (deck: DeckListing) => Promise<void>;
  onProgress: (completed: number) => void;
};

export async function applyDeckCardLanguage({ decks, language, saveDeck, onProgress }: Params) {
  let saved = 0;
  let failed = 0;
  let unavailable = 0;
  let completed = 0;
  for (const deck of decks) {
    const converted = convertDeckCardLanguage({ deck, language });
    unavailable += converted.unavailable;
    if (converted.changed) {
      try {
        await saveDeck(converted.deck);
        saved += 1;
      } catch {
        failed += 1;
      }
    }
    completed += 1;
    onProgress(completed);
  }
  return { saved, failed, unavailable };
}
