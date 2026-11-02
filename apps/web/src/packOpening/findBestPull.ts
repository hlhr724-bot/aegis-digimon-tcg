import type { PackCard } from "@/packOpening/PackCard";
import { getPackCardRank } from "@/packOpening/getPackCardRank";

export function findBestPull(cards: readonly PackCard[]): PackCard | undefined {
  return cards.reduce<PackCard | undefined>(
    (best, card) => (!best || getPackCardRank(card) > getPackCardRank(best) ? card : best),
    undefined,
  );
}
