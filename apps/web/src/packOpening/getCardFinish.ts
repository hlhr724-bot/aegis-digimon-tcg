import { CardFinish, type CardFinishEntry } from "@/packOpening/CardFinish";
import { findPackRarity } from "@/packOpening/findPackRarity";
import type { PackCard } from "@/packOpening/PackCard";
import { PackRarity } from "@/packOpening/PackRarity";

export function getCardFinish(card: PackCard | undefined): CardFinishEntry {
  if (!card) {
    return CardFinish.NONE;
  }
  if (card.artId) {
    return CardFinish.PRISMATIC;
  }
  switch (findPackRarity(card.rarity)?.value) {
    case PackRarity.RARE.value:
      return CardFinish.HOLO;
    case PackRarity.SUPER_RARE.value:
      return CardFinish.STARLIGHT;
    case PackRarity.ULTRA_RARE.value:
      return CardFinish.GOLD;
    case PackRarity.SECRET_RARE.value:
      return CardFinish.PRISMATIC;
    default:
      return CardFinish.NONE;
  }
}
