import type { CardDefinition } from "@aegis/shared/cards/types";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardKind } from "@aegis/shared/schema/enums";
import { countDeckCards } from "#api/ranked/archetypes/countDeckCards";

type Params = { mainDeck: readonly string[] };
type Candidate = { card: CardDefinition; level: number; copies: number; isFinalForm: boolean };

const FINAL_FORM_LEVEL = 6;

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    Number(right.isFinalForm) - Number(left.isFinalForm) ||
    right.copies - left.copies ||
    right.level - left.level ||
    left.card.cardId.localeCompare(right.card.cardId)
  );
}

export function getDeckKeyDigimon({ mainDeck }: Params): CardDefinition | null {
  const candidates: Candidate[] = [];
  for (const [cardId, copies] of countDeckCards(mainDeck)) {
    const card = getCardDefinition(cardId);
    if (!card || !card.kinds.includes(CardKind.Digimon)) {
      continue;
    }
    const level = card.level ?? 0;
    candidates.push({ card, level, copies, isFinalForm: level >= FINAL_FORM_LEVEL });
  }
  return candidates.sort(compareCandidates)[0]?.card ?? null;
}
