import type { CardTranslationData } from "@/i18n/cardTranslationTypes";

export const cardTranslationCache: {
  data?: CardTranslationData;
  pending?: Promise<CardTranslationData>;
  printedData?: CardTranslationData;
  printedPending?: Promise<CardTranslationData>;
} = {};
