import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";
import { getCardTextField } from "@/i18n/getCardTextField";
import type { CardTextField } from "@/i18n/CardTextField";
import { expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { allCards } from "@aegis/shared/cards/registry";
import { printedModalBullets, printedModalPreamble } from "@aegis/shared/effects/printedClauses";
import { getPrintedClauseGroupTexts } from "@/game/getPrintedClauseGroupTexts";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { resolveCardText } from "@/i18n/resolveCardText";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import {
  noticeEffectClause,
  TIMING_LABELS,
  playerFacingEffectClause,
  effectClausesForTiming,
} from "@/game/overlay/effectText";

it("covers every supported Chinese display fragment and reports raw engine hints separately", async () => {
  const translations = await loadPrintedCardTranslations();
  const counts: Record<string, number> = {};
  const missing: { kind: string; cardId: string; text: string }[] = [];
  const seen = new Set<string>();
  const resolutions: { kind: string; cardId: string; input: string; text: string; status: string; source: string }[] =
    [];
  const baselineMissing: Record<string, number> = {};
  function inspect(kind: string, cardId: string, text: string, field?: CardTextField, timing?: string) {
    const key = JSON.stringify([kind, cardId, text, field, timing]);
    if (!text.trim() || seen.has(key)) return;
    seen.add(key);
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (getTranslatedCardText({ text, cardId, translations }) === text && /[a-z]{3}/i.test(text))
      baselineMissing[kind] = (baselineMissing[kind] ?? 0) + 1;
    const result = resolveCardText({ text, cardId, field, timing, translations, allowContext: true });
    resolutions.push({ kind, cardId, input: text, ...result });
    if (result.status !== "complete") {
      missing.push({ kind, cardId, text });
    }
  }
  for (const label of Object.values(TIMING_LABELS)) {
    inspect("timing", "", `[${label}]`);
  }
  inspect("grantedKeyword", "AD1-008", "[When Digivolving] ＜Blitz＞");
  for (const card of allCards()) {
    for (const full of [
      card.effectText,
      card.inheritedEffectText,
      card.securityEffectText,
      card.optionEffect,
      card.linkEffect,
    ]) {
      if (!full) continue;
      inspect("full", card.cardId, full);
      for (const clause of getPrintedClauseGroupTexts(full)) {
        if (!clause.startsWith("[Rule]")) inspect("clause", card.cardId, clause);
        if (printedModalBullets(clause).length) {
          inspect("preamble", card.cardId, printedModalPreamble(clause));
          for (const bullet of printedModalBullets(clause)) inspect("bullet", card.cardId, bullet);
        }
      }
    }
    for (const timing of Object.keys(TIMING_LABELS)) {
      for (const isInherited of [false, true]) {
        if (isInherited && !card.inheritedEffectText) continue;
        const text = noticeEffectClause({ cardId: card.cardId, timing, isInherited, description: undefined });
        if (
          text &&
          timing !== "Rule" &&
          (isInherited
            ? [card.inheritedEffectText]
            : [card.effectText, card.securityEffectText, card.optionEffect, card.linkEffect]
          ).some((full) => effectClausesForTiming(full, timing).length > 0)
        )
          inspect("notice", card.cardId, text, getCardTextField({ cardId: card.cardId, timing, isInherited, text }));
      }
    }
  }
  const effects = JSON.parse(readFileSync("../../packages/shared/src/effects/effects.json", "utf8"));
  for (const [cardId, compiled] of Object.entries(effects) as [
    string,
    { effects: { trigger: string; isInherited?: boolean }[] },
  ][]) {
    for (const effect of compiled.effects) {
      if (effect.trigger === "OnDiscardSecurity") {
        const text = noticeEffectClause({
          cardId,
          timing: effect.trigger,
          isInherited: effect.isInherited,
          description: undefined,
        });
        if (text) inspect("unbracketedNotice", cardId, text);
      }
      function visit(value: unknown) {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!value || typeof value !== "object") return;
        for (const [name, part] of Object.entries(value)) {
          if (name === "raw" && "kind" in value && value.kind === "SubTrigger" && typeof part === "string") {
            const reason = /^\s*(when\b[^,]*)/i.exec(part)?.[1]?.trim();
            if (reason) inspect("triggerReason", cardId, reason);
          }
          if ((name === "effectTextPart" || name === "effectTextEmphasis") && typeof part === "string") {
            inspect(name, cardId, part);
            const text = playerFacingEffectClause({
              cardId,
              timing: effect.trigger,
              isInherited: effect.isInherited,
              description: undefined,
              effectTextPart: part,
            });
            if (text)
              inspect(
                "displayedStep",
                cardId,
                text,
                getCardTextField({ cardId, timing: effect.trigger, isInherited: effect.isInherited, text }),
                effect.trigger,
              );
          }
          visit(part);
        }
      }
      visit(effect);
    }
  }
  const normalized = new Map<string, { sources: Set<string>; translations: Set<string> }>();
  for (const result of resolutions.filter((entry) => entry.kind === "full")) {
    const key = normalizePrintedTextKey(result.input);
    const entry = normalized.get(key) ?? { sources: new Set<string>(), translations: new Set<string>() };
    entry.sources.add(result.input);
    entry.translations.add(result.text);
    normalized.set(key, entry);
  }
  const normalizationConflicts = [...normalized]
    .filter(([, entry]) => entry.sources.size > 1 && entry.translations.size > 1)
    .map(([key, entry]) => ({ key, sources: [...entry.sources], translations: [...entry.translations] }));
  const statuses: Record<string, number> = {};
  for (const result of resolutions) {
    const key = `${result.kind}:${result.status}:${result.source}`;
    statuses[key] = (statuses[key] ?? 0) + 1;
  }
  const report = { counts, baselineMissing, statuses, normalizationConflicts, missing, resolutions };
  expect(normalizationConflicts).toEqual([]);
  mkdirSync("../../.local", { recursive: true });
  writeFileSync("../../.local/card-fragment-translation-coverage.json", JSON.stringify(report, null, 2));
  expect(missing.filter((entry) => entry.kind !== "effectTextPart" && entry.kind !== "effectTextEmphasis")).toEqual([]);
  expect(counts.full).toBeGreaterThan(6000);
}, 120_000);
