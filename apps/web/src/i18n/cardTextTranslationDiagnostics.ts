import type { CardTextResolution } from "@/i18n/resolveCardText";
import type { CardTextField } from "@/i18n/CardTextField";

export const cardTextTranslationDiagnostics = new Map<
  string,
  {
    cardId?: string;
    field?: CardTextField;
    surface?: string;
    timing?: string;
    locale: string;
    text: string;
    result: CardTextResolution;
    count: number;
  }
>();
