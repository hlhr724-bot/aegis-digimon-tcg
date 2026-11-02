import { CardKind, getCardDefinition, type CardDefinition } from "@aegis/shared";
import { kindOf } from "@/design/theme";
import type { CountMap } from "@/screens/deckCounts";

export interface DeckCardTypeCounts {
  Digimon: number;
  Tamer: number;
  Option: number;
  Dual: number;
  DigiEgg: number;
}

interface CountDeckCardTypesParams {
  main: CountMap;
  egg?: CountMap;
}

function deckCardType(definition: CardDefinition): keyof DeckCardTypeCounts {
  if (definition.kinds.includes(CardKind.Digimon) && definition.kinds.includes(CardKind.Option)) return "Dual";
  return kindOf(definition);
}

export function countDeckCardTypes({ main, egg = {} }: CountDeckCardTypesParams): DeckCardTypeCounts {
  const counts: DeckCardTypeCounts = { Digimon: 0, Tamer: 0, Option: 0, Dual: 0, DigiEgg: 0 };
  for (const [cardId, count] of [...Object.entries(main), ...Object.entries(egg)]) {
    const definition = getCardDefinition(cardId);
    if (!definition) {
      continue;
    }
    counts[deckCardType(definition)] += count;
  }
  return counts;
}
