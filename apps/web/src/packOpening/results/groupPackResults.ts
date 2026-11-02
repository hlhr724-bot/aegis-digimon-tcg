import { findPackRarity } from "@/packOpening/findPackRarity";
import { getPackCardRank } from "@/packOpening/getPackCardRank";
import type { PackCard } from "@/packOpening/PackCard";
import { PACK_SIZE } from "@/packOpening/results/packSize";
import { ResultGrouping } from "@/packOpening/results/ResultGrouping";
import { ResultRarityFilter } from "@/packOpening/results/ResultRarityFilter";
import { ResultSort } from "@/packOpening/results/ResultSort";

type Params = {
  cards: readonly PackCard[];
  query: string;
  rarity: string;
  sort: ResultSort;
  grouping: ResultGrouping;
};

export interface ResultEntry {
  card: PackCard;
  index: number;
}

export interface ResultGroup {
  key: string;
  label: string;
  entries: ResultEntry[];
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function matchesQuery(card: PackCard, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    card.nameEn.toLowerCase().includes(normalized) ||
    card.cardId.toLowerCase().includes(normalized)
  );
}

function matchesRarity(card: PackCard, rarity: string): boolean {
  if (rarity === ResultRarityFilter.ALL.value) {
    return true;
  }
  if (rarity === ResultRarityFilter.ALTERNATE_ART.value) {
    return card.artId !== undefined;
  }
  return card.rarity === rarity;
}

function compareEntries(sort: ResultSort, first: ResultEntry, second: ResultEntry): number {
  switch (sort) {
    case ResultSort.RARITY.value:
      return getPackCardRank(second.card) - getPackCardRank(first.card) || first.index - second.index;
    case ResultSort.NAME.value:
      return collator.compare(first.card.nameEn, second.card.nameEn) || first.index - second.index;
    case ResultSort.NUMBER.value:
      return collator.compare(first.card.cardId, second.card.cardId) || first.index - second.index;
    default:
      return first.index - second.index;
  }
}

function describeGroup(grouping: ResultGrouping, entry: ResultEntry): Omit<ResultGroup, "entries"> & { rank: number } {
  if (grouping === ResultGrouping.PACK.value) {
    const pack = Math.floor(entry.index / PACK_SIZE);
    return { key: `pack-${pack}`, label: `Pack ${pack + 1}`, rank: pack };
  }
  if (grouping === ResultGrouping.RARITY.value) {
    if (entry.card.artId) {
      return { key: "aa", label: ResultRarityFilter.ALTERNATE_ART.label, rank: -100 };
    }
    const rarity = findPackRarity(entry.card.rarity);
    return {
      key: `rarity-${rarity?.value ?? "unknown"}`,
      label: rarity?.label ?? "Other",
      rank: -getPackCardRank(entry.card),
    };
  }
  return { key: "all", label: "All cards", rank: 0 };
}

export function groupPackResults({ cards, query, rarity, sort, grouping }: Params): ResultGroup[] {
  const entries = cards
    .map((card, index) => ({ card, index }))
    .filter((entry) => matchesQuery(entry.card, query) && matchesRarity(entry.card, rarity))
    .sort((first, second) => compareEntries(sort, first, second));
  const groups = new Map<string, ResultGroup & { rank: number }>();
  for (const entry of entries) {
    const description = describeGroup(grouping, entry);
    const group = groups.get(description.key) ?? { ...description, entries: [] };
    group.entries.push(entry);
    groups.set(description.key, group);
  }
  return [...groups.values()]
    .sort((first, second) => first.rank - second.rank)
    .map(({ key, label, entries: groupEntries }) => ({ key, label, entries: groupEntries }));
}
