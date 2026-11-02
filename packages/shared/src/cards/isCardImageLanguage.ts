import { CardImageLanguage } from "#shared/cards/CardImageLanguage";

export function isCardImageLanguage(value: unknown): value is CardImageLanguage {
  return typeof value === "string" && Object.values(CardImageLanguage).some((entry) => entry.value === value);
}
