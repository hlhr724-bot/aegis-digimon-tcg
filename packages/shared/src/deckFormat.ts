import { getLimitedCardAvailability } from "#shared/cards/getLimitedCardAvailability";
import { banlistAsOf, BANLIST_AS_OF_DATE, bannedPairViolations } from "./banlist.js";
import { allProductLabels, releaseDateForCard, releaseDateForSet } from "./cards/cardPool.js";
import { getCardDefinition } from "./cards/registry.js";

export type HistoricalDeckSet = `${"BT" | "EX" | "ST" | "RB" | "AD"}${number}`;
export type DeckRuleMode = "standard" | "unlimited" | "pauper";
/** Pool and rules are independent. Plain set ids retain their original Standard meaning. */
export type DeckFormat = DeckRuleMode | HistoricalDeckSet | `${HistoricalDeckSet}:${"pauper" | "unlimited"}`;

export function historicalDeckFormats(asOf = BANLIST_AS_OF_DATE): HistoricalDeckSet[] {
  return allProductLabels().filter(
    (id) => /^(BT|EX|ST|RB|AD)\d+$/.test(id) && releaseDateForSet(id)! <= asOf,
  ) as HistoricalDeckSet[];
}

export function isDeckFormat(value: unknown): value is DeckFormat {
  if (value === "standard" || value === "unlimited" || value === "pauper") return true;
  if (typeof value !== "string") return false;
  const [set, rules, extra] = value.split(":");
  return (
    historicalDeckFormats().includes(set as HistoricalDeckSet) &&
    extra === undefined &&
    (rules === undefined || rules === "pauper" || rules === "unlimited")
  );
}

export function deckFormatSettings(format: DeckFormat): { set: HistoricalDeckSet | "all"; rules: DeckRuleMode } {
  const [set = "all", rules] = format.split(":");
  return releaseDateForSet(set) === undefined
    ? { set: "all", rules: format as DeckRuleMode }
    : { set: set as HistoricalDeckSet, rules: (rules ?? "standard") as DeckRuleMode };
}

export function createDeckFormat(set: HistoricalDeckSet | "all", rules: DeckRuleMode): DeckFormat {
  return set === "all" ? rules : rules === "standard" ? set : `${set}:${rules}`;
}

export function formatIsUnlimited(format: DeckFormat): boolean {
  return deckFormatSettings(format).rules === "unlimited";
}

/** Old decks and clients have no format field. */
export function deckFormat(value: unknown, unlimited = false): DeckFormat {
  return isDeckFormat(value) ? value : unlimited ? "unlimited" : "standard";
}

export function formatBanlistDate(format: DeckFormat): string {
  return releaseDateForSet(deckFormatSettings(format).set) ?? BANLIST_AS_OF_DATE;
}

const formatBanlists = new Map<string, ReturnType<typeof banlistAsOf>>();

export function formatCopyLimit(cardId: string, format: DeckFormat): number {
  const printed = getCardDefinition(cardId)?.maxCountInDeck ?? 4;
  if (formatIsUnlimited(format)) return printed;
  const date = formatBanlistDate(format);
  let list = formatBanlists.get(date);
  if (!list) {
    list = banlistAsOf(date);
    formatBanlists.set(date, list);
  }
  const entry = list[cardId];
  return entry === undefined || entry.status === "banned_pair" ? printed : Math.min(printed, entry.count);
}

/** Rarity comes from the base card definition; cosmetic artwork cannot change legality. */
export function formatCardViolation(cardId: string, format: DeckFormat): string | undefined {
  const card = getCardDefinition(cardId);
  if (!card) return `unknown card: ${cardId}`;
  if (card.isToken || card.maxCountInDeck === 0) return `${cardId} cannot be included in a deck`;
  const { set, rules } = deckFormatSettings(format);
  if (rules === "pauper" && card.rarity !== "C" && card.rarity !== "U")
    return `${cardId} is not Common or Uncommon (Pauper allows C/U only)`;
  const cutoff = releaseDateForSet(set);
  if (cutoff !== undefined) {
    const released = getLimitedCardAvailability(cardId)?.legalDate ?? releaseDateForCard(card);
    if (released === undefined || released > cutoff)
      return `${cardId} is outside the ${set} card pool (through ${cutoff})`;
  }
  return undefined;
}

export function formatRestrictionLabel(cardId: string, format: DeckFormat): string | undefined {
  if (formatCardViolation(cardId, format)) return "OUTSIDE FORMAT";
  const cap = formatCopyLimit(cardId, format);
  if (cap === 0) return "BANNED";
  if (cap < (getCardDefinition(cardId)?.maxCountInDeck ?? 4)) return `LIMIT ${cap}`;
  return undefined;
}

export function formatPairViolations(cardIds: readonly string[], format: DeckFormat): [string, string][] {
  return formatIsUnlimited(format) ? [] : bannedPairViolations(cardIds, formatBanlistDate(format));
}
