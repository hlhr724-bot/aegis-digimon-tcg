import type { CardDefinition } from "@aegis/shared";
import { getCardArts } from "@aegis/shared/cards/arts";
import { boosterReprints } from "@/packOpening/boosterReprints";
import type { PackCard } from "@/packOpening/PackCard";
import { PackRarity } from "@/packOpening/PackRarity";

type Params = {
  setId: string;
  cards: readonly CardDefinition[];
};

const PACK_RARITIES = new Set<string>(Object.values(PackRarity).map((entry) => entry.value));
const SET_ART_LABELS: Readonly<Record<string, string>> = {
  RB1: "RB-01: Resurgence Booster",
};

export function listBoosterReprints({ setId, cards }: Params): PackCard[] {
  const reprints = boosterReprints[setId] ?? [];
  const artLabel = SET_ART_LABELS[setId];
  return reprints.flatMap((reprint) => {
    const card = cards.find((candidate) => candidate.cardId === reprint.cardId);
    if (!card || !PACK_RARITIES.has(reprint.rarity)) {
      return [];
    }
    const art = getCardArts(card.cardId).find((candidate) => candidate.label === artLabel);
    return [{ ...card, rarity: reprint.rarity, ...(art ? { artId: art.artId } : {}) }];
  });
}
