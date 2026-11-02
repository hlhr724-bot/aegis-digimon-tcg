import { getCardDefinition } from "@aegis/shared/cards/registry";
import entries from "@/i18n/cardTextContextOverrides.json";
import type { CardTextField } from "@/i18n/CardTextField";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";

type Params = {
  text: string;
  cardId?: string;
  field?: CardTextField;
  timing?: string;
  translations: CardTranslationData;
};

export function getReviewedCardTextContext({ text, cardId, field, timing, translations }: Params): string | undefined {
  const card = cardId ? getCardDefinition(cardId) : undefined;
  if (!card) {
    return undefined;
  }
  const matches = new Set<string>();
  for (const entry of Object.values(entries)) {
    const contextField = entry.field as CardTextField;
    if (
      entry.cardId !== cardId ||
      (field && field !== contextField) ||
      !timing ||
      !entry.timings.includes(timing) ||
      normalizePrintedTextKey(text) !== normalizePrintedTextKey(entry.fragment) ||
      card[contextField] !== entry.source
    ) {
      continue;
    }
    const translated = getTranslatedCardText({ text: entry.context, cardId, field: contextField, translations });
    if (translated !== entry.context) {
      matches.add(translated);
    }
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}
