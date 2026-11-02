import type { OpenedPack } from "@/packOpening/BoosterProgress";
import { getPackCardKey } from "@/packOpening/getPackCardKey";
import type { PackCard } from "@/packOpening/PackCard";

type Params = {
  pack: OpenedPack;
  eligible: ReadonlyMap<string, PackCard>;
};

export function listOpenedPackCards({ pack, eligible }: Params): PackCard[] {
  return pack.cards.flatMap((card) => {
    const found = eligible.get(getPackCardKey(card));
    return found ? [found] : [];
  });
}
