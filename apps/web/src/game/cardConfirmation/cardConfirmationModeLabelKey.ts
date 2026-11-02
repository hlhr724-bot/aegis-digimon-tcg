import type { TranslationKey } from "@/i18n/translationTypes";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";

const labelKeys = new Map<CardConfirmationMode, TranslationKey>(
  Object.values(CardConfirmationMode).map((mode) => [mode.value, mode.labelKey]),
);

export function cardConfirmationModeLabelKey(mode: CardConfirmationMode): TranslationKey {
  return labelKeys.get(mode) ?? CardConfirmationMode.ALWAYS.labelKey;
}
