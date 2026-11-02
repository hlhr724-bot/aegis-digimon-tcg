import { getCardDefinition } from "@aegis/shared";
import type { Translate } from "../../../i18n";
import type { StackCard } from "../types";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";

/** A card's name in a stack listing; a face-down card its owner can read keeps a face-down mark. */
export function stackCardCaption(card: StackCard, t: Translate, translations?: CardTranslationData): string {
  if (!card.cardId) return t("game.hiddenCard");
  const name = getTranslatedCardName({ name: getCardDefinition(card.cardId)?.nameEn ?? card.cardId, translations });
  return card.faceDown ? `${name} · ${t("game.faceDownSource")}` : name;
}
