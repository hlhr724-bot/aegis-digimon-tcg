import { getCardDefinition } from "@aegis/shared/cards/registry";
import { printedModalBullets, printedModalPreamble } from "@aegis/shared/effects/printedClauses";
import { CardTextField } from "@/i18n/CardTextField";
import { CardTextStatus } from "@/i18n/CardTextStatus";
import { CardTextSource } from "@/i18n/CardTextSource";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import type { Locale } from "@/i18n/locales";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { getDictionaryValue } from "@/i18n/getDictionaryValue";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";
import { getPrintedClauseGroupTexts } from "@/game/getPrintedClauseGroupTexts";
import { getChinesePrintedTimingLabel } from "@/i18n/getChinesePrintedTimingLabel";
import { getTranslatedKeyword } from "@/i18n/getTranslatedKeyword";
import { findTranslatedCardClause } from "@/i18n/findTranslatedCardClause";
import { getReviewedCardTextContext } from "@/i18n/getReviewedCardTextContext";
import { getTranslatedRulePrompt } from "@/i18n/getTranslatedRulePrompt";
import { getAuthoredCardTextContext } from "@/i18n/getAuthoredCardTextContext";

type Params = {
  text: string;
  cardId?: string;
  field?: CardTextField;
  surface?: string;
  translations?: CardTranslationData;
  locale?: Locale;
  loadingStatus?: CardTextStatus;
  allowContext?: boolean;
  timing?: string;
};

export type CardTextResolution = {
  text: string;
  status: CardTextStatus;
  source: CardTextSource;
  unresolvedSegments: string[];
  reason?: string;
  field?: CardTextField;
};

export function resolveCardText(params: Params): CardTextResolution {
  const { text, cardId, field, translations, locale = "zh-CN", loadingStatus, allowContext = false } = params;
  const original: CardTextResolution = {
    text,
    status: CardTextStatus.COMPLETE.value,
    source: CardTextSource.ORIGINAL.value,
    unresolvedSegments: [],
    field,
  };
  if (locale === "en" || !text.trim()) {
    return original;
  }
  if (loadingStatus === CardTextStatus.ERROR.value || loadingStatus === CardTextStatus.PENDING.value || !translations) {
    return {
      ...original,
      status:
        loadingStatus === CardTextStatus.COMPLETE.value
          ? CardTextStatus.MISSING.value
          : (loadingStatus ?? CardTextStatus.PENDING.value),
      unresolvedSegments: [text],
      reason: "printed-dictionary-unavailable",
    };
  }
  const card = cardId ? getCardDefinition(cardId) : undefined;
  const runtime = /^＜[^＞]+＞:\s*\S/.test(text)
    ? getDictionaryValue({ dictionary: translations.text, key: normalizePrintedTextKey(text) })
    : undefined;
  if (runtime) {
    return { ...original, text: runtime, source: CardTextSource.DICTIONARY.value };
  }
  if (field && (!card || !card[field])) {
    return {
      ...original,
      status: CardTextStatus.MISSING.value,
      unresolvedSegments: [text],
      reason: "field-unavailable",
    };
  }
  const cardText = cardId ? getDictionaryValue({ dictionary: translations.byCard, key: cardId }) : undefined;
  const key = normalizePrintedTextKey(text);
  const reviewed = allowContext ? getReviewedCardTextContext({ ...params, translations }) : undefined;
  const authored = allowContext ? getAuthoredCardTextContext(params) : undefined;
  if (!reviewed && !authored && field && normalizePrintedTextKey(card![field]!).indexOf(key) < 0) {
    return {
      ...original,
      status: CardTextStatus.MISSING.value,
      unresolvedSegments: [text],
      reason: "source-field-mismatch",
    };
  }
  const direct =
    getDictionaryValue({ dictionary: cardText, key }) ?? getDictionaryValue({ dictionary: translations.text, key });
  const translated = getTranslatedCardText({ text, translations, cardId, field });
  if (translated !== text) {
    const clause = direct ? undefined : findTranslatedCardClause({ text, translations, cardId, field });
    const unresolved =
      direct || clause
        ? []
        : text
            .split(/[\r\n]+/)
            .filter(
              (line) =>
                /[A-Za-z]/.test(line) && getTranslatedCardText({ text: line, translations, cardId, field }) === line,
            );
    return {
      ...original,
      text: translated,
      status: unresolved.length ? CardTextStatus.PARTIAL.value : CardTextStatus.COMPLETE.value,
      source: direct ? CardTextSource.DICTIONARY.value : CardTextSource.CLAUSE.value,
      unresolvedSegments: unresolved,
    };
  }
  if (reviewed) {
    return { ...original, text: reviewed, source: CardTextSource.CONTEXT.value, reason: "reviewed-effect-context" };
  }
  if (authored) {
    const context = resolveCardText({ ...params, ...authored, allowContext: false });
    if (context.text !== authored.text && context.status === CardTextStatus.COMPLETE.value) {
      return {
        ...context,
        source: CardTextSource.CONTEXT.value,
        reason: "authored-effect-context",
      };
    }
  }
  if (locale === "zh-CN" || locale === "zh-TW") {
    const prompt = getTranslatedRulePrompt({ text, cardId, translations });
    if (prompt && !/＜[A-Za-z][^＞]*＞/.test(prompt)) {
      return { ...original, text: prompt, source: CardTextSource.TEMPLATE.value };
    }
    const timing = getChinesePrintedTimingLabel({ label: text.trim() });
    if (timing) {
      return { ...original, text: timing, source: CardTextSource.TOKENS.value };
    }
    const keyword = /^(?:＜[^＞]+＞|<[^<>]+>|[A-Za-z][A-Za-z .-]*(?:[ +-]*\d+)?)$/.test(text.trim())
      ? getTranslatedKeyword({ keyword: text, translations })
      : text;
    if (keyword !== text) {
      const unresolved = /[A-Za-z]/.test(keyword) ? [text] : [];
      return {
        ...original,
        text: keyword,
        source: CardTextSource.TOKENS.value,
        status: unresolved.length ? CardTextStatus.PARTIAL.value : CardTextStatus.COMPLETE.value,
        unresolvedSegments: unresolved,
      };
    }
  }
  if (allowContext && card && text.trim().length >= 12) {
    const groups = getPrintedClauseGroupTexts(text);
    const prefix = groups[0] ? text.slice(0, text.indexOf(groups[0])).trim() : "";
    const parts = [...(prefix ? [prefix] : []), ...groups];
    if (parts.length > 1) {
      const results = parts.map((part) => resolveCardText({ ...params, text: part }));
      if (results.every((result) => result.status === CardTextStatus.COMPLETE.value)) {
        return {
          ...original,
          text: [...new Set(results.map((result) => result.text))].join("\n"),
          source: CardTextSource.CONTEXT.value,
          reason: "complete-effect-context",
        };
      }
    }
    const candidates = new Map<string, CardTextField>();
    for (const entry of Object.values(CardTextField)) {
      if (field && entry.value !== field) {
        continue;
      }
      const full = card[entry.value];
      const clauses = getPrintedClauseGroupTexts(full ?? "");
      for (const clause of clauses.length ? clauses : [full ?? ""]) {
        const bullets = printedModalBullets(clause);
        const units = bullets.length
          ? [printedModalPreamble(clause), ...bullets, ...(bullets.length === 1 && /^\[/.test(text) ? [clause] : [])]
          : [clause];
        for (const unit of units) {
          if (!hasCompleteFragment({ unit, fragment: text })) {
            continue;
          }
          const context = resolveCardText({ ...params, text: unit, field: entry.value, allowContext: false });
          if (context.text !== unit && context.status === CardTextStatus.COMPLETE.value) {
            candidates.set(context.text, entry.value);
          }
        }
      }
    }
    if (candidates.size === 1) {
      const [context, contextField] = [...candidates][0]!;
      return {
        ...original,
        text: context,
        field: contextField,
        source: CardTextSource.CONTEXT.value,
        reason: "complete-effect-context",
      };
    }
  }
  if (locale !== "zh-CN" && locale !== "zh-TW") {
    return {
      ...original,
      status: CardTextStatus.MISSING.value,
      unresolvedSegments: [text],
      reason: "unmapped-fragment",
    };
  }
  let changed = false;
  const unresolvedSegments: string[] = [];
  const controlled = text.replace(/[^\r\n]+/g, (line) => {
    let end = 0;
    let result = "";
    for (const match of line.matchAll(/\[([^\]\r\n]+)\]|＜([^＞\r\n]+)＞|<([^<>\r\n]+)>/g)) {
      if (line.slice(end, match.index).trim()) {
        break;
      }
      const label = match[1] ? getChinesePrintedTimingLabel({ label: match[1] }) : undefined;
      const token = match[1]
        ? label
          ? `[${label}]`
          : match[0]
        : getTranslatedKeyword({ keyword: match[0], translations });
      if (/[A-Za-z]/.test(token)) {
        unresolvedSegments.push(match[0]);
      }
      changed ||= token !== match[0];
      result += line.slice(end, match.index) + token;
      end = match.index + match[0].length;
    }
    const remainder = line.slice(end);
    if (/[A-Za-z]/.test(remainder.replace(/\b(?:DP|ACE|DNA|Lv)\b|[A-Z]{1,3}\d*-\d+/g, ""))) {
      unresolvedSegments.push(remainder);
    }
    return result + remainder;
  });
  if (changed || unresolvedSegments.length === 0) {
    return {
      ...original,
      text: controlled,
      source: CardTextSource.TOKENS.value,
      status: unresolvedSegments.length ? CardTextStatus.PARTIAL.value : CardTextStatus.COMPLETE.value,
      unresolvedSegments,
      reason: unresolvedSegments.length ? "unmapped-rule-body" : undefined,
    };
  }
  return { ...original, status: CardTextStatus.MISSING.value, unresolvedSegments: [text], reason: "unmapped-fragment" };
}

type FragmentParams = { unit: string; fragment: string };

function hasCompleteFragment({ unit, fragment }: FragmentParams): boolean {
  const normalize = (value: string) =>
    value
      .replace(/&#(?:160|xA0);|&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/＜/g, "<")
      .replace(/＞/g, ">")
      .trim();
  const source = normalize(unit);
  const requested = normalize(fragment);
  const start = source.indexOf(requested);
  if (start < 0 || source.indexOf(requested, start + 1) >= 0) {
    return false;
  }
  const before = source.slice(0, start);
  const after = source.slice(start + requested.length);
  const completeEnd = /[.!?:;>)\]"]$/.test(requested) || /^[,;:.]/.test(after);
  return (!before || /[\s\]>]$/.test(before)) && completeEnd && (!after || /^[\s[,;:.]/.test(after));
}
