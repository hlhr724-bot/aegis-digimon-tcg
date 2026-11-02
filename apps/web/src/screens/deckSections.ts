/* Groups a deck's cards the way a printed list reads: eggs, Digimon by level,
   tamers, options, then anything unclassified. Shared by the famous-deck dialog
   and the deck image export. */

import { getCardDefinition } from "@aegis/shared";
import { kindOf } from "../design/theme";
import type { DeckListing } from "../game/decks";
import type { Translate } from "../i18n";
import { sortCardIds } from "./cardSorting";
import { deckSectionLevel } from "@/screens/deckSectionLevel";

export interface DeckSectionEntry {
  cardId: string;
  count: number;
}

export interface DeckSection {
  id: string;
  label: string;
  entries: DeckSectionEntry[];
}

function countCopies(cardIds: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cardId of cardIds) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  return counts;
}

function toEntries(counts: Map<string, number>, cardIds: string[]): DeckSectionEntry[] {
  return sortCardIds(cardIds).map((cardId) => ({ cardId, count: counts.get(cardId) ?? 0 }));
}

function totalOf(entries: { count: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

export function deckSections(deck: DeckListing, t: Translate): DeckSection[] {
  const mainCounts = countCopies(deck.mainDeck);
  const eggCounts = countCopies(deck.eggDeck);
  const byLevel = new Map<number, string[]>();
  const tamers: string[] = [];
  const options: string[] = [];
  const other: string[] = [];

  for (const cardId of mainCounts.keys()) {
    const definition = getCardDefinition(cardId);
    const kind = definition ? kindOf(definition) : undefined;
    const level = definition ? deckSectionLevel(definition) : undefined;
    if (level != null) {
      const cards = byLevel.get(level) ?? [];
      cards.push(cardId);
      byLevel.set(level, cards);
    } else if (kind === "Tamer") tamers.push(cardId);
    else if (kind === "Option") options.push(cardId);
    else other.push(cardId);
  }

  const eggEntries = toEntries(eggCounts, [...eggCounts.keys()]);
  const sections: DeckSection[] = [
    { id: "eggs", label: t("deck.eggSection", { count: totalOf(eggEntries) }), entries: eggEntries },
    ...[...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, cardIds]) => {
        const entries = toEntries(mainCounts, cardIds);
        return { id: `level-${level}`, label: t("deck.levelSection", { level, count: totalOf(entries) }), entries };
      }),
  ];
  const tamerEntries = toEntries(mainCounts, tamers);
  sections.push({
    id: "tamers",
    label: t("deck.tamerSection", { count: totalOf(tamerEntries) }),
    entries: tamerEntries,
  });
  const optionEntries = toEntries(mainCounts, options);
  sections.push({
    id: "options",
    label: t("deck.optionSection", { count: totalOf(optionEntries) }),
    entries: optionEntries,
  });
  const otherEntries = toEntries(mainCounts, other);
  sections.push({
    id: "other",
    label: t("deck.otherSection", { count: totalOf(otherEntries) }),
    entries: otherEntries,
  });
  return sections.filter((section) => section.entries.length > 0);
}
