import { EGG_DECK_TARGET, MAIN_DECK_TARGET } from "@aegis/shared/decks/legality";
import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import type { DeckViolation } from "@/tournaments/types";

type TournamentDeckViolationsParams = {
  deck: { mainDeck: readonly string[]; eggDeck: readonly string[] };
  banlistCards: readonly TournamentBanlistCard[];
};

export function tournamentDeckViolations({ deck, banlistCards }: TournamentDeckViolationsParams): DeckViolation[] {
  const violations: DeckViolation[] = [];
  if (deck.mainDeck.length !== MAIN_DECK_TARGET) {
    violations.push({ kind: "main_deck_size", size: deck.mainDeck.length, required: MAIN_DECK_TARGET });
  }
  if (deck.eggDeck.length > EGG_DECK_TARGET) {
    violations.push({ kind: "egg_deck_size", size: deck.eggDeck.length, max: EGG_DECK_TARGET });
  }
  const copies = new Map<string, number>();
  for (const cardId of [...deck.mainDeck, ...deck.eggDeck]) {
    copies.set(cardId, (copies.get(cardId) ?? 0) + 1);
  }
  for (const card of banlistCards) {
    const count = copies.get(card.cardId) ?? 0;
    if (card.status === "banned" && count > 0) {
      violations.push({ kind: "banned", cardId: card.cardId });
    }
    if (card.status === "restricted" && count > card.allowedCopies) {
      violations.push({ kind: "over_copy_limit", cardId: card.cardId, copies: count, allowed: card.allowedCopies });
    }
  }
  return violations;
}
