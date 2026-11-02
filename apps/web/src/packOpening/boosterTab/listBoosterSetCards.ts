import type { BoosterSet } from "@/packOpening/listBoosterSets";
import { getPackCardRarity } from "@/packOpening/getPackCardRarity";
import { listPackAlternateArts } from "@/packOpening/listPackAlternateArts";
import type { PackCard } from "@/packOpening/PackCard";

export function listBoosterSetCards(boosterSet: BoosterSet): PackCard[] {
  const { setId, cards } = boosterSet;
  return [
    ...cards.map((card) => ({ ...card, rarity: getPackCardRarity({ card, setId }) })),
    ...listPackAlternateArts({ cards, setId }),
  ];
}
