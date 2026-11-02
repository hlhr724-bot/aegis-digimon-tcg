import { expect, it } from "vitest";
import { allCards } from "@aegis/shared/cards/registry";
import { effectClausesForTiming, TIMING_LABELS } from "@/game/overlay/effectText";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";
import { printedModalBullets, printedModalPreamble } from "@aegis/shared/effects/printedClauses";
import { getPrintedClauseGroupTexts } from "@/game/getPrintedClauseGroupTexts";

it("covers modal preambles without displaying their choices", async () => {
  const translations = await loadPrintedCardTranslations();
  const missing: string[] = [];
  for (const card of allCards()) {
    for (const full of [
      card.effectText,
      card.inheritedEffectText,
      card.securityEffectText,
      card.optionEffect,
      card.linkEffect,
    ]) {
      for (const clause of getPrintedClauseGroupTexts(full ?? "")) {
        if (printedModalBullets(clause).length === 0) {
          continue;
        }
        const text = printedModalPreamble(clause);
        const result = getTranslatedCardText({ text, cardId: card.cardId, translations });
        if (result === text || /^[ \t]*[・·•]/m.test(result)) {
          missing.push(`${card.cardId}: ${text}`);
        }
      }
    }
  }
  expect(missing).toEqual([]);
});

it("covers every recognized resolving clause in the current Chinese catalog", async () => {
  const translations = await loadPrintedCardTranslations();
  const missing: string[] = [];
  for (const card of allCards()) {
    for (const full of [
      card.effectText,
      card.inheritedEffectText,
      card.securityEffectText,
      card.optionEffect,
      card.linkEffect,
    ]) {
      if (!full) {
        continue;
      }
      const seen = new Set<string>();
      for (const [timing, label] of Object.entries(TIMING_LABELS)) {
        if (label === "Rule") {
          continue;
        }
        for (const text of effectClausesForTiming(full, timing)) {
          const key = normalizePrintedTextKey(text);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          if (getTranslatedCardText({ text, cardId: card.cardId, translations }) === text) {
            missing.push(`${card.cardId}: ${timing}: ${key}`);
          }
        }
      }
    }
  }
  expect(missing).toEqual([]);
}, 30_000);
