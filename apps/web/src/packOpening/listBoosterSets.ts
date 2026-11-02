import { activeCollectionCards } from "@/game/decks";
import { listBoosterReprints } from "@/packOpening/listBoosterReprints";
import type { PackCard } from "@/packOpening/PackCard";
import { PackRarity } from "@/packOpening/PackRarity";

export interface BoosterSet {
  setId: string;
  coverUrl: string;
  cards: PackCard[];
}

const BOOSTER_COVER_SET_IDS = [
  ...Array.from({ length: 26 }, (_, index) => `BT${26 - index}`),
  ...Array.from({ length: 13 }, (_, index) => `EX${13 - index}`),
  "RB1",
  "AD1",
];

const PACK_RARITIES = new Set<string>(Object.values(PackRarity).map((entry) => entry.value));

export function listBoosterSets(): BoosterSet[] {
  const collection = activeCollectionCards();
  const cards = collection.filter((card) => card.rarity && PACK_RARITIES.has(card.rarity));
  return BOOSTER_COVER_SET_IDS.map((setId) => ({
    setId,
    coverUrl: `/sets/${setId}.jpg`,
    cards: [...cards.filter((card) => card.set === setId), ...listBoosterReprints({ setId, cards: collection })],
  })).filter((set) => set.cards.some((card) => card.rarity === PackRarity.COMMON.value));
}
