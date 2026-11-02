import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedKeyword } from "@/i18n/getTranslatedKeyword";
import { getTranslatedKeywordReminder } from "@/i18n/getTranslatedKeywordReminder";
import { useTranslation } from "../../i18n";
import { keywordReminder, keywordRuleHintLink } from "../keywordReminders";
import { BadgeHint, type BadgeHintText } from "./BadgeHint";

type Annotation = { label: string; description: string };
import type { PermanentKeywordEntry } from "./permanentKeywords";

/** Never more pills than this, however wide the card is. */
const MAX_VISIBLE_KEYWORD_COUNT = 3;
/** The pill line starts after the digivolution count and reaches past the card's right edge (fieldBadges.css). */
const LINE_START_PX = 22;
const LINE_OVERHANG_PX = 12;
/** The pills use a 9px monospace font: every character is 0.6em wide. */
const CHARACTER_WIDTH_PX = 5.4;
const PILL_PADDING_PX = 8;
const PILL_GAP_PX = 2;
const MORE_CHIP_WIDTH_PX = 22;

const pillWidth = (label: string) =>
  Array.from(label).reduce(
    (width, character) => width + ((character.codePointAt(0) ?? 0) > 255 ? 9 : CHARACTER_WIDTH_PX),
    PILL_PADDING_PX,
  );

/**
 * How many pills fit on the single line above a card of `cardWidth`, leaving room for the
 * "+N" chip when some are left out. If no complete label fits, show only the count
 * with every keyword in its explanation rather than a truncated fragment.
 */
export function visibleKeywordCount(labels: readonly string[], cardWidth: number): number {
  const available = cardWidth - LINE_START_PX + LINE_OVERHANG_PX;
  let used = 0;
  let count = 0;
  for (const label of labels.slice(0, MAX_VISIBLE_KEYWORD_COUNT)) {
    const next = used + (count > 0 ? PILL_GAP_PX : 0) + pillWidth(label);
    const needsMoreChip = count + 1 < labels.length;
    if (next + (needsMoreChip ? PILL_GAP_PX + MORE_CHIP_WIDTH_PX : 0) > available) break;
    used = next;
    count += 1;
  }
  return count;
}

/** The resolved keyword pills on one line just above a permanent's card. */
export function PermanentKeywordBadges({
  keywords,
  securityAttackModifier,
  cardWidth,
  annotations = [],
}: {
  keywords: readonly PermanentKeywordEntry[];
  securityAttackModifier: number;
  cardWidth: number;
  annotations?: readonly Annotation[];
}) {
  const { t } = useTranslation();
  const translations = useCardTranslations();
  const displayedKeywords: { key: string; label: string; hint: BadgeHintText }[] = keywords.map((entry) => {
    const label = getTranslatedKeyword({ keyword: entry.label, translations });
    return {
      key: entry.keyword,
      label,
      hint: {
        title: `<${label}>`,
        description: getTranslatedKeywordReminder({
          keyword: entry.keyword,
          fallback: keywordReminder(entry.keyword, t, securityAttackModifier),
          translations,
          modifier: securityAttackModifier,
        }),
        link: keywordRuleHintLink(entry.keyword),
      },
    };
  });
  for (const annotation of annotations) {
    const label = annotation.label.trim();
    if (!label || displayedKeywords.some((entry) => entry.label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      continue;
    }
    displayedKeywords.push({
      key: `annotation:${label}`,
      label,
      hint: { title: label, description: annotation.description },
    });
  }
  const shownCount = visibleKeywordCount(
    displayedKeywords.map((entry) => entry.label),
    cardWidth,
  );
  const visibleKeywords = displayedKeywords.slice(0, shownCount);
  const hiddenKeywordCount = displayedKeywords.length - visibleKeywords.length;
  return (
    <div
      className="game-keyword-badges"
      aria-label={`Active keywords: ${displayedKeywords.map((entry) => entry.label).join(", ")}`}
    >
      {visibleKeywords.map(({ key, label, hint }) => (
        <BadgeHint key={key} className="game-keyword-badge" hint={hint}>
          {label}
        </BadgeHint>
      ))}
      {hiddenKeywordCount > 0 ? (
        <BadgeHint
          className="game-keyword-badge game-keyword-badge--more"
          aria-label={`${hiddenKeywordCount} more keywords`}
          hint={{
            title: displayedKeywords
              .slice(shownCount)
              .map((entry) => entry.label)
              .join(" · "),
            description: t("redesign.arena.badge.keywordsMore", { count: hiddenKeywordCount }),
          }}
        >
          +{hiddenKeywordCount}
        </BadgeHint>
      ) : null}
    </div>
  );
}
