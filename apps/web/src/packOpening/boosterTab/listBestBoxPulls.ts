import type { OpenedPack } from "@/packOpening/BoosterProgress";
import type { BoxPull } from "@/packOpening/boosterTab/BoxPull";
import { listOpenedPackCards } from "@/packOpening/boosterTab/listOpenedPackCards";
import { getPackCardKey } from "@/packOpening/getPackCardKey";
import { getPackCardRank } from "@/packOpening/getPackCardRank";
import type { PackCard } from "@/packOpening/PackCard";
import { PackRarity } from "@/packOpening/PackRarity";

type Params = {
  packs: readonly OpenedPack[];
  eligible: ReadonlyMap<string, PackCard>;
  limit: number;
};

const FILLER_RARITIES = new Set<string | undefined>([PackRarity.COMMON.value, PackRarity.UNCOMMON.value]);

function isHighlight(card: PackCard): boolean {
  return card.artId !== undefined || !FILLER_RARITIES.has(card.rarity);
}

export function listBestBoxPulls({ packs, eligible, limit }: Params): BoxPull[] {
  const pulls = packs.flatMap((pack, index) =>
    listOpenedPackCards({ pack, eligible })
      .filter(isHighlight)
      .map((card) => ({ card, packNumber: index + 1 })),
  );
  const ranked = pulls.sort((first, second) => getPackCardRank(second.card) - getPackCardRank(first.card));
  const seen = new Set<string>();
  return ranked
    .filter(({ card }) => {
      const key = getPackCardKey(card);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
