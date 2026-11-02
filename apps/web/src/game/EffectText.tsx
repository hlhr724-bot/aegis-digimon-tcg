import { getInspectorMarker } from "@/game/getInspectorMarker";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { useResolvedCardText } from "@/i18n/useResolvedCardText";
import type { CardTextField } from "@/i18n/CardTextField";
import { resolveTranslatedKeyword } from "@/i18n/resolveTranslatedKeyword";
import { getTranslatedKeywordReminder } from "@/i18n/getTranslatedKeywordReminder";
import "./EffectText.css";
import { inlineInspectorKeywordLines } from "./arenaInspectorModel";
import { KEYWORD_GLOSSARY, OFFICIAL_COMPREHENSIVE_RULES_URL } from "./keywordGlossary";
import { findCardMechanic } from "@/game/findCardMechanic";
import { keywordRuleHintLink, normalizeKeywordBrackets } from "./keywordReminders";
import { BadgeHint } from "./piece/BadgeHint";

/** A printed keyword, explained on tap when the Comprehensive Rules define it. */
type KeywordParams = { keyword: string; inspector: boolean };

function KeywordMark({ keyword, inspector }: KeywordParams) {
  const translations = useCardTranslations();
  const resolved = resolveTranslatedKeyword({ keyword, translations });
  const label = resolved.label;
  const entry = Object.hasOwn(KEYWORD_GLOSSARY, resolved.base) ? KEYWORD_GLOSSARY[resolved.base] : undefined;
  if (!entry) return <mark data-kind="keyword">{label}</mark>;
  return (
    <BadgeHint
      className="card-effect-text__keyword"
      role={inspector ? "button" : undefined}
      tabIndex={inspector ? 0 : undefined}
      onKeyDown={(event) => {
        if (inspector && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      hint={{
        title: normalizeKeywordBrackets(label),
        description: getTranslatedKeywordReminder({
          keyword: resolved.reminderKeyword,
          fallback: entry.reminder,
          translations,
        }),
        link: keywordRuleHintLink(resolved.base),
      }}
    >
      <mark data-kind="keyword">{label}</mark>
    </BadgeHint>
  );
}

type MarkerParams = { marker: string; inspector: boolean };

function TimingMark({ marker, inspector }: MarkerParams) {
  const mark = (
    <mark
      data-kind="timing"
      data-marker={inspector ? (getInspectorMarker({ text: marker }) ?? "reference") : undefined}
    >
      {marker}
    </mark>
  );
  const mechanic = findCardMechanic({ marker });
  if (!mechanic) {
    return mark;
  }
  return (
    <BadgeHint
      className="card-effect-text__mechanic"
      role={inspector ? "button" : undefined}
      tabIndex={inspector ? 0 : undefined}
      onKeyDown={(event) => {
        if (inspector && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      hint={{
        title: marker,
        description: mechanic.reminder,
        link: { label: `Comprehensive Rules ${mechanic.rule}`, href: OFFICIAL_COMPREHENSIVE_RULES_URL },
      }}
    >
      {mark}
    </BadgeHint>
  );
}

/**
 * Printed timing and keyword markers shared by card details and effect notices.
 * `asciiBrackets` prints the card data's full-width ＜Keyword＞ brackets as <Keyword>.
 */
type Params = {
  text: string;
  asciiBrackets?: boolean;
  inspector?: boolean;
  cardId?: string;
  field?: CardTextField;
  surface?: string;
  allowContext?: boolean;
  timing?: string;
};

export function EffectText({
  text,
  asciiBrackets = false,
  inspector = false,
  cardId,
  field,
  surface,
  allowContext = false,
  timing,
}: Params) {
  const result = useResolvedCardText({ text, cardId, field, surface, allowContext, timing });
  const lines = inlineInspectorKeywordLines(result.text);
  return (
    <span
      key={`${asciiBrackets}:${lines}`}
      className="card-effect-text"
      data-inspector={inspector || undefined}
      data-translation-status={result.status}
      data-translation-source={result.source}
    >
      {lines
        .split(/(\[[^\]]+\]|＜[^＞]+＞|<[^<>\r\n]+>|（每回合\d+次）)/g)
        .map((part, index) =>
          /^\[/.test(part) || (inspector && /^（每回合\d+次）$/.test(part)) ? (
            <TimingMark key={index} marker={part} inspector={inspector} />
          ) : /^[＜<].+[＞>]$/.test(part) ? (
            <KeywordMark
              key={index}
              inspector={inspector}
              keyword={asciiBrackets ? normalizeKeywordBrackets(part) : part}
            />
          ) : (
            <span key={index}>{asciiBrackets ? normalizeKeywordBrackets(part) : part}</span>
          ),
        )}
    </span>
  );
}
