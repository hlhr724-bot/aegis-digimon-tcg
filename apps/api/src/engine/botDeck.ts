import {
  ALL_FAMOUS_DECKS,
  famousDeckById,
  famousDeckGroups,
  allCards,
  CardKind,
  formatCardViolation,
  formatCopyLimit,
  type DeckFormat,
  type FamousDeck,
} from "@aegis/shared";
import { RANDOM_SET_BOT_DECK_PREFIX } from "@aegis/shared/decks/randomSetBotDeckPrefix";
import { validateDecklist } from "./deckValidation.js";
import { BOT_DECKS, type Decklist } from "./testDecks.js";

function findRandomSetPool(requestedDeckId: string | undefined): readonly FamousDeck[] {
  if (!requestedDeckId?.startsWith(RANDOM_SET_BOT_DECK_PREFIX)) {
    return [];
  }
  const collection = requestedDeckId.slice(RANDOM_SET_BOT_DECK_PREFIX.length);
  return famousDeckGroups().find((group) => group.collection === collection)?.decks ?? [];
}

/**
 * The deck the bot actually sits down with, guaranteed to pass the same gate the room
 * applies to a human deck.
 *
 * `isFamousDeckAvailable` only asks whether every card exists and is not outright banned.
 * `validateDecklist` asks more: an announced-but-unreleased card is illegal outside beta battle mode, and a
 * banned *pair* is illegal even though each card is fine alone. A preset can therefore
 * be "available" and still be rejected at seating — which used to throw out of
 * `seatPlayer` and strand the room with an empty opponent seat.
 *
 * This runs the authoritative gate for both requested and random presets. If the
 * requested preset cannot be played, the bot draws from the same legal catalog pool.
 */
export function playableBotDeck(requestedDeckId: string | undefined, format: DeckFormat = "standard"): Decklist {
  const requested = requestedDeckId === undefined ? undefined : famousDeckById(requestedDeckId);
  if (requested && validateDecklist(requested.decklist, { format }).ok) {
    return { mainDeck: [...requested.decklist.mainDeck], eggDeck: [...requested.decklist.eggDeck] };
  }

  const isLegal = (preset: FamousDeck) => validateDecklist(preset.decklist, { format }).ok;
  const setCandidates = findRandomSetPool(requestedDeckId).filter(isLegal);
  const candidates = setCandidates.length > 0 ? setCandidates : ALL_FAMOUS_DECKS.filter(isLegal);
  if (candidates.length > 0) {
    const selected = candidates[Math.floor(Math.random() * candidates.length)]!;
    return { mainDeck: [...selected.decklist.mainDeck], eggDeck: [...selected.decklist.eggDeck] };
  }

  const fallback = BOT_DECKS.find((deck) => validateDecklist(deck, { format }).ok);
  if (fallback === undefined) {
    // The built-in pool is asserted legal at module load, so this is unreachable short of
    // a banlist edit that outlaws a starter deck. Surfacing it as an explicit failure beats
    // seating a deck the engine will reject mid-deal.
    const mainDeck: string[] = [];
    for (const card of allCards()) {
      if (card.kinds.includes(CardKind.DigiEgg) || formatCardViolation(card.cardId, format)) continue;
      const count = Math.min(formatCopyLimit(card.cardId, format), 50 - mainDeck.length);
      mainDeck.push(...Array(count).fill(card.cardId));
      if (mainDeck.length === 50 && validateDecklist({ mainDeck, eggDeck: [] }, { format }).ok)
        return { mainDeck, eggDeck: [] };
    }
    throw new Error("no legal bot deck available");
  }
  return fallback;
}
