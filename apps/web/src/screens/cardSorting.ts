/* Card ordering — collection order (set, then number) and the sorts the library offers. */

import { releaseDateForCard, type CardDefinition } from "@aegis/shared";
import { kindOf } from "../design/theme";
import { CardSort } from "./cardFilters";

// Chronological EN release order — higher index = more recent.
// Source: world.digimoncard.com / en.digimoncard.com official release events.
const SET_RELEASE_ORDER: Record<string, number> = {
  ST1: 1,
  ST2: 2,
  ST3: 3,
  BT1: 4,
  BT2: 5,
  BT3: 6,
  ST4: 7,
  ST5: 8,
  ST6: 9,
  BT4: 10,
  BT5: 11,
  ST7: 12,
  ST8: 13,
  BT6: 14,
  EX1: 15,
  BT7: 16,
  ST9: 17,
  ST10: 18,
  BT8: 19,
  EX2: 20,
  BT9: 21,
  ST12: 22,
  ST13: 23,
  BT10: 24,
  EX3: 25,
  BT11: 26,
  BT12: 27,
  ST14: 28,
  EX4: 29,
  RB1: 30,
  BT13: 31,
  ST15: 32,
  ST16: 33,
  BT14: 34,
  EX5: 35,
  BT15: 36,
  ST17: 37,
  BT16: 38,
  EX6: 39,
  BT17: 40,
  ST18: 41,
  ST19: 42,
  EX7: 43,
  BT18: 44,
  EX8: 45,
  BT19: 46,
  BT20: 47,
  ST20: 48,
  ST21: 49,
  BT21: 50,
  EX9: 51,
  BT22: 52,
  EX10: 53,
  BT23: 54,
  ST22: 55,
  BT24: 56,
  EX11: 57,
  ST23: 58,
  ST24: 59,
  AD1: 60,
  BT25: 61,
  EX12: 62,
  EX13: 63,
  BT27: 64,
  EX14: 65,
};

// Sets with no single release date — always sorted to the bottom.
const MISC_SETS: Record<string, number> = { LM: 1, P: 2 };

// Approximate EN release year per promo (set "P"), keyed by the highest P-NNN of
// each year's wave. Boundaries are derived from which promo pack contains each
// range (Bandai does not publish a per-card release date), so edges are fuzzy.
// Anchors: Promotion Pack Ver.0.0 = 2021 launch; 1st Anniversary = 2022;
// 3rd Anniversary Update Pack (BT-13) = 2023; Adventure 02 + Update Pack (BT-17)
// = 2024; Tamer Battle Pack 26 = Jan 2025.
const PROMO_YEAR_BANDS: ReadonlyArray<readonly [maxNumber: number, year: number]> = [
  [28, 2021],
  [90, 2022],
  [116, 2023],
  [142, 2024],
  [Infinity, 2025],
];

function promoYear(cardId: string): number {
  const n = cardNumber(cardId);
  return (PROMO_YEAR_BANDS.find(([max]) => n <= max) ?? [0, 2025])[1];
}

// Most-recent-first: negate release index so highest index sorts first.
// Misc sets (promos, limited packs spanning multiple eras) go after all dated sets.
export function collectionOrder(set: string): number {
  const s = set.toUpperCase();
  const order = SET_RELEASE_ORDER[s];
  if (order !== undefined) return -order;
  const misc = MISC_SETS[s];
  return misc !== undefined ? 900000 + misc : 999999;
}

function cardNumber(cardId: string): number {
  const dash = cardId.lastIndexOf("-");
  return dash > 0 ? parseInt(cardId.slice(dash + 1), 10) : 0;
}

// Within a collection group, promos cluster newest-year-first; everything else
// keeps ascending card number.
function withinCollectionOrder(idA: string, setA: string, idB: string, setB: string): number {
  if (setA.toUpperCase() === "P" && setB.toUpperCase() === "P") {
    const yearDiff = promoYear(idB) - promoYear(idA);
    if (yearDiff !== 0) return yearDiff;
  }
  return cardNumber(idA) - cardNumber(idB);
}

export function sortByCollection(cards: readonly CardDefinition[]): CardDefinition[] {
  return [...cards].sort((a, b) => {
    const diff = collectionOrder(a.set) - collectionOrder(b.set);
    if (diff !== 0) return diff;
    return withinCollectionOrder(a.cardId, a.set, b.cardId, b.set);
  });
}

function compareNumbers(a: number | undefined, b: number | undefined): number {
  return (a ?? Infinity) - (b ?? Infinity);
}

/** Sorts the card pool for browsing; random order is reshuffled when selected. */
export function sortCards(cards: readonly CardDefinition[], sort: CardSort): CardDefinition[] {
  const sorted = [...cards];
  if (sort === "random") {
    for (let i = sorted.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
    }
    return sorted;
  }
  return sorted.sort((a, b) => {
    if (sort === "releaseDate") {
      const dateOrder = (releaseDateForCard(b) ?? "").localeCompare(releaseDateForCard(a) ?? "");
      return dateOrder || a.cardId.localeCompare(b.cardId, undefined, { numeric: true });
    }
    if (sort === "dp") return compareNumbers(a.dp, b.dp) || a.nameEn.localeCompare(b.nameEn);
    if (sort === "level") return compareNumbers(a.level, b.level) || a.nameEn.localeCompare(b.nameEn);
    if (sort === "playCost") return compareNumbers(a.playCost, b.playCost) || a.nameEn.localeCompare(b.nameEn);
    if (sort === "type") return kindOf(a).localeCompare(kindOf(b)) || a.nameEn.localeCompare(b.nameEn);
    if (sort === "cardNumber") return a.cardId.localeCompare(b.cardId, undefined, { numeric: true });
    return a.nameEn.localeCompare(b.nameEn);
  });
}

export function sortCardIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const setA = a.split("-")[0] ?? "";
    const setB = b.split("-")[0] ?? "";
    const diff = collectionOrder(setA) - collectionOrder(setB);
    if (diff !== 0) return diff;
    return withinCollectionOrder(a, setA, b, setB);
  });
}
