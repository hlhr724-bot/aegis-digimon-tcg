import { getLimitedCardAvailability } from "#shared/cards/getLimitedCardAvailability";
import type { CardDefinition } from "./types.js";

type ReleaseDate = `${number}-${number}-${number}`;
type CardReference = Readonly<Pick<CardDefinition, "cardId" | "set">>;

interface ProductRelease {
  date: ReleaseDate;
  label: string;
}

/**
 * Product dates are deliberately shared by the client and authoritative server.
 *
 * **Convention: English (global) release dates**, taken from the "Release date" field of
 * the official product catalogue at `world.digimoncard.com/products/` — the same site the
 * rules knowledge base and the banlist effective dates come from. Japanese dates and the
 * Asia-English catalogue (`en.digimoncard.com`, which publishes the Japanese schedule) are
 * deliberately **not** used: mixing them would make an `as_of_set` banlist snapshot resolve
 * against a date no English format ever had. Pre-release-event dates are not used either;
 * the in-stores date is what makes a card legal.
 *
 * Verified against the official catalogue on 2026-08-12.
 *
 * Three sets have no per-set English date, because the English game never sold them as
 * standalone products. Each takes the date of the combined booster that shipped it:
 *
 * - `BT1`/`BT2`/`BT3` — split across RELEASE SPECIAL BOOSTER Ver.1.0 (2021-02-12, 187 cards)
 *   and Ver.1.5 (2021-03-12, 152 cards), which together cover all 339 cards of the three
 *   sets. Neither booster maps onto one set, so the split below is an approximation: the
 *   whole BT1–BT3 pool is complete on 2021-03-12.
 * - `BT18`/`BT19`/`BT20` — SPECIAL BOOSTER Ver.2.0 (2024-11-01) shipped all of BT18 and half
 *   of BT19; Ver.2.5 (2025-02-28) shipped the rest of BT19 and all of BT20. BT19 therefore
 *   carries the later date, at which the set is complete.
 *
 * Within a shared release date the booster that names the format is listed first.
 */
const PRODUCT_RELEASES: Readonly<Record<string, ProductRelease>> = {
  ST1: { date: "2021-01-29", label: "ST1" },
  ST2: { date: "2021-01-29", label: "ST2" },
  ST3: { date: "2021-01-29", label: "ST3" },
  BT1: { date: "2021-02-12", label: "BT1" },
  BT2: { date: "2021-03-12", label: "BT2" },
  BT3: { date: "2021-03-12", label: "BT3" },
  BT4: { date: "2021-06-11", label: "BT4" },
  ST4: { date: "2021-06-11", label: "ST4" },
  ST5: { date: "2021-06-11", label: "ST5" },
  ST6: { date: "2021-06-11", label: "ST6" },
  BT5: { date: "2021-08-06", label: "BT5" },
  BT6: { date: "2021-10-15", label: "BT6" },
  ST7: { date: "2021-10-15", label: "ST7" },
  ST8: { date: "2021-10-15", label: "ST8" },
  EX1: { date: "2021-12-10", label: "EX1" },
  BT7: { date: "2022-03-04", label: "BT7" },
  BT8: { date: "2022-05-13", label: "BT8" },
  ST9: { date: "2022-05-13", label: "ST9" },
  ST10: { date: "2022-05-13", label: "ST10" },
  EX2: { date: "2022-06-24", label: "EX2" },
  BT9: { date: "2022-07-29", label: "BT9" },
  BT10: { date: "2022-10-14", label: "BT10" },
  ST12: { date: "2022-10-14", label: "ST12" },
  ST13: { date: "2022-10-14", label: "ST13" },
  EX3: { date: "2022-11-11", label: "EX3" },
  BT11: { date: "2023-02-17", label: "BT11" },
  ST14: { date: "2023-03-24", label: "ST14" },
  BT12: { date: "2023-04-28", label: "BT12" },
  EX4: { date: "2023-06-23", label: "EX4" },
  BT13: { date: "2023-07-21", label: "BT13" },
  RB1: { date: "2023-09-29", label: "RB1" },
  ST15: { date: "2023-10-13", label: "ST15" },
  ST16: { date: "2023-10-13", label: "ST16" },
  BT14: { date: "2023-11-17", label: "BT14" },
  EX5: { date: "2024-01-19", label: "EX5" },
  BT15: { date: "2024-02-16", label: "BT15" },
  ST17: { date: "2024-03-08", label: "ST17" },
  BT16: { date: "2024-05-24", label: "BT16" },
  EX6: { date: "2024-06-28", label: "EX6" },
  BT17: { date: "2024-08-09", label: "BT17" },
  EX7: { date: "2024-09-13", label: "EX7" },
  ST18: { date: "2024-09-13", label: "ST18" },
  ST19: { date: "2024-09-13", label: "ST19" },
  BT18: { date: "2024-11-01", label: "BT18" },
  EX8: { date: "2025-01-10", label: "EX8" },
  BT19: { date: "2025-02-28", label: "BT19" },
  BT20: { date: "2025-02-28", label: "BT20" },
  ST20: { date: "2025-04-18", label: "ST20" },
  ST21: { date: "2025-04-18", label: "ST21" },
  BT21: { date: "2025-04-25", label: "BT21" },
  EX9: { date: "2025-06-26", label: "EX9" },
  BT22: { date: "2025-07-25", label: "BT22" },
  EX10: { date: "2025-09-19", label: "EX10" },
  BT23: { date: "2025-10-24", label: "BT23" },
  ST22: { date: "2025-12-05", label: "ST22" },
  BT24: { date: "2026-01-23", label: "BT24" },
  EX11: { date: "2026-02-13", label: "EX11" },
  AD1: { date: "2026-03-27", label: "AD1" },
  ST23: { date: "2026-05-15", label: "ST23" },
  ST24: { date: "2026-05-15", label: "ST24" },
  BT25: { date: "2026-05-22", label: "BT25" },
  EX12: { date: "2026-07-03", label: "EX12" },
  BT26: { date: "2026-09-04", label: "BT26" },
  // Announced, not yet in stores as of this table's last verification (2026-09-11).
  EX13: { date: "2026-10-02", label: "EX13" },
  BT27: { date: "2026-12-11", label: "BT27" },
  EX14: { date: "2027-01-22", label: "EX14" },
};

/**
 * Promo cards do not share one product date. These product groupings are
 * transcribed from the official card list's Notes field; dates for event windows
 * are their first distribution dates. Keeping membership explicit matters: promo
 * numbers are not reliably chronological after the first releases.
 *
 * Unverified, unlike {@link PRODUCT_RELEASES} above: these dates have not been checked
 * against a primary source. Several groups tied to a booster (the BT6 Dash Pack, the BT7
 * and BT8 packs) still carry that booster's pre-correction date and now sit slightly
 * before the product they shipped with. Nothing resolves differently today because these
 * dates only order and label products, but a promo audit is still owed.
 */
interface PromoProduct {
  date: ReleaseDate;
  cardIds: string;
  label?: string;
}

const PROMO_PRODUCTS: ReadonlyArray<Readonly<PromoProduct>> = [
  { date: "2020-11-16", cardIds: "001 002 003 004 005 006" }, // Promotion Pack Ver. 0.0
  { date: "2021-02-12", cardIds: "007 008 009 010 011 012" }, // Special Box Promotion Pack
  { date: "2021-02-01", cardIds: "013 014 015 016 017 018 019 020" }, // Tournament Pack Vol. 1
  { date: "2021-03-12", cardIds: "021 022 023 024" }, // Special Release Memorial Pack
  { date: "2021-06-11", cardIds: "025 026 027 029 030 031 032 033 034" }, // Great Dash/Power Up
  { date: "2021-06-04", cardIds: "028" }, // Great Legend pre-release
  { date: "2021-10-15", cardIds: "035 036 037 038 039 040" }, // ST7/ST8
  { date: "2021-09-24", cardIds: "041 042 043 044 045 046" }, // Double Diamond Dash Pack
  { date: "2022-02-04", cardIds: "047 048" }, // Next Adventure pre-release
  { date: "2022-02-11", cardIds: "049 050 051 052 053 054 055 056 057" }, // BT7/TP Vol. 4
  { date: "2022-03-11", cardIds: "058 059 060 061 062 063 064" }, // BT8/TP Vol. 5
  { date: "2022-10-14", cardIds: "065", label: "ST11 Special Entry Pack" },
  { date: "2023-04-28", cardIds: "066 067 068 069 070 071" }, // BT12 Limited Card Pack
  { date: "2022-07-29", cardIds: "072 073 074 075 076 077 078" }, // BT9 Update Pack
  { date: "2023-02-15", cardIds: "079 080 081" }, // Tamer Party Vol. 7
  { date: "2024-05-01", cardIds: "082 083 084 085 086 116" }, // Tournament Packs Vol. 13/11
  { date: "2023-11-10", cardIds: "087" }, // BT15 pre-release
  { date: "2023-09-29", cardIds: "088 089 090" }, // RB1
  { date: "2023-11-17", cardIds: "091 092 093 094 095 096" }, // 3rd Anniversary Update Pack
  { date: "2024-04-26", cardIds: "097 098 099 100 101 102" }, // EX5 Limited Card Set
  { date: "2023-11-17", cardIds: "103 104 105 106 107 108 110 111 112 113 114 115" }, // BT14 packs
  { date: "2023-11-08", cardIds: "109" }, // Adventure 02 tutorial deck
  { date: "2023-12-01", cardIds: "117 118 119 120 121 122 123 124 125 126 127 128 129 130" },
  { date: "2024-06-28", cardIds: "131 132 133 134 135 136" }, // Liberator Promotion Pack
  { date: "2024-08-09", cardIds: "137 138 139 140 141 142" }, // BT17 Update Pack
  { date: "2024-07-01", cardIds: "143 144 145 146 147 148 149 150 151" }, // Store Tournament Jul–Sep
  { date: "2024-10-01", cardIds: "152 153 154 155 156 157 158 159" }, // Store Tournament Oct–Dec
  { date: "2024-11-22", cardIds: "160 161 162 163" }, // EX8 Upgrade Pack
  { date: "2025-01-31", cardIds: "164 165 166 167 168 169" }, // Store Tournament 2025 Vol. 1
  { date: "2025-02-28", cardIds: "170 171 172 173 174 175" }, // BT19-20 Update Pack
  { date: "2025-04-01", cardIds: "176 177 178 179 180 181" }, // Store Tournament 2025 Vol. 2
  { date: "2025-06-27", cardIds: "182 183 184 185 186 187" }, // BT21 Celebration Pack
  { date: "2025-07-01", cardIds: "188 189 190 191 192 193" }, // Store Tournament 2025 Vol. 3
  { date: "2025-08-01", cardIds: "194 195 196 197 198 199 200" }, // Time Stranger Promo Pack
  { date: "2025-10-01", cardIds: "201 202 203 204 205 206" }, // Store Tournament 2025 Vol. 4
  { date: "2025-10-24", cardIds: "207 208 209 210 211 212" }, // BT23 Box Topper
  { date: "2026-01-01", cardIds: "213 214 215 216 217 218 219" }, // Store Tournament 2026 Vol. 1
  { date: "2026-01-23", cardIds: "220 221 222 223 224 225" }, // BT24 Box Topper
  { date: "2026-02-13", cardIds: "227 228 229 230 231 232" }, // EX11 Box Topper
  { date: "2026-04-01", cardIds: "233 234 235 236 237 238" }, // Store Tournament 2026 Vol. 2
  { date: "2026-06-01", cardIds: "239 240 241 242 243 244" }, // Store Tournament 2026 Vol. 3
  // Announced (event window 2026-10-01–12-31), not yet distributed as of this table's
  // last verification (2026-09-11).
  { date: "2026-10-01", cardIds: "245 246 247 248 249 250" }, // Store Tournament 2026 Vol. 4
];

const PROMO_RELEASE_DATES: Readonly<Record<string, ReleaseDate>> = Object.freeze(
  Object.fromEntries(
    PROMO_PRODUCTS.flatMap(({ date, cardIds }) => cardIds.split(" ").map((number) => [`P-${number}`, date])),
  ),
);

/**
 * The verified English release date for a product (`BT10`, `EX5`, `ST1`, …), if we have one.
 * `P` has no single date — promos release per card — so it resolves to undefined.
 */
export function releaseDateForSet(setId: string): ReleaseDate | undefined {
  return PRODUCT_RELEASES[setId]?.date;
}

/** The verified English release date for a card, if we have one. */
export function releaseDateForCard(card: CardReference): ReleaseDate | undefined {
  if (card.set === "LM") {
    return getLimitedCardAvailability(card.cardId)?.releaseDate;
  }
  if (card.set === "P") {
    return PROMO_RELEASE_DATES[card.cardId];
  }
  return PRODUCT_RELEASES[card.set]?.date;
}

/**
 * Whether `card` belongs to a product that has not released yet (its verified date is
 * strictly after `asOf`, defaulting to today). Cards with no verified date (nothing in
 * {@link PRODUCT_RELEASES}/{@link PROMO_RELEASE_DATES}) are treated as already released —
 * this predicate exists to gate a specific announced-but-unreleased product (e.g. EX13
 * ahead of its 2026-10-02 street date), not to silently hide every uncatalogued card.
 */
export function isBetaOnlyCard(card: CardReference, asOf: string = new Date().toISOString().slice(0, 10)): boolean {
  const date = releaseDateForCard(card);
  return date !== undefined && date > asOf;
}

/** The committed promo-card inventory for a named product, in catalog order. */
export function promoProductCardIds(productLabel: string): string[] {
  const product = PROMO_PRODUCTS.find(({ label }) => label === productLabel);
  return product?.cardIds.split(" ").map((number) => `P-${number}`) ?? [];
}

/** Every non-promo product, oldest release first. */
export function allProductLabels(): string[] {
  return Object.values(PRODUCT_RELEASES)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date.localeCompare(b.date)))
    .map((release) => release.label);
}

/**
 * The newest product already in stores, which is what a tournament block defaults to.
 * A product with a future release date is excluded so the default never names a set
 * players cannot buy yet.
 */
export function latestReleasedProductLabel(asOf: string = new Date().toISOString().slice(0, 10)): string {
  const released = allProductLabels().filter((label) => (releaseDateForSet(label) ?? "") <= asOf);
  return released[released.length - 1]!;
}
