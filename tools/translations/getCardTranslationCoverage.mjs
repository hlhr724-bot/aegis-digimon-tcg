import { normalizePrintedTextKey } from "../../apps/web/src/i18n/normalizePrintedTextKey.ts";

export function getCardTranslationCoverage({ cards, names, texts, meta }) {
  const missing = [];
  let effectCount = 0;
  let translatedCount = 0;
  function hasTranslation(dictionary, key) {
    return Object.hasOwn(dictionary, key) && typeof dictionary[key] === "string" && dictionary[key].trim().length > 0;
  }
  for (const card of cards) {
    if (!hasTranslation(names, card.nameEn)) {
      missing.push({ cardId: card.cardId, field: "nameEn", text: card.nameEn });
    } else if (!/(?:ACE|ＡＣＥ)\s*$/iu.test(card.nameEn) && /(?:ACE|ＡＣＥ)\s*$/iu.test(names[card.nameEn])) {
      missing.push({
        cardId: card.cardId,
        field: "nameEn",
        text: card.nameEn,
        translation: names[card.nameEn],
        reason: "ACE classification must not be part of a shared card name",
      });
    }
    for (const field of ["effectText", "inheritedEffectText", "securityEffectText", "optionEffect", "linkEffect"]) {
      const text = card[field];
      if (!text) {
        continue;
      }
      effectCount++;
      if (hasTranslation(texts, normalizePrintedTextKey(text))) {
        translatedCount++;
        continue;
      }
      const untranslatedLines = text
        .split(/\r\n|\r|\n/)
        .filter((line) => line.trim() && !hasTranslation(texts, normalizePrintedTextKey(line)));
      if (untranslatedLines.length === 0) {
        translatedCount++;
        continue;
      }
      missing.push({ cardId: card.cardId, field, text, untranslatedLines });
    }
    for (const [field, group] of [
      ["forms", "forms"],
      ["attributes", "attributes"],
      ["types", "traits"],
    ]) {
      for (const value of card[field] ?? []) {
        if (!hasTranslation(meta[group], value)) {
          missing.push({ cardId: card.cardId, field, text: value });
        }
      }
    }
  }
  return { cards: cards.length, effectCount, translatedCount, missingCount: missing.length, missing };
}
