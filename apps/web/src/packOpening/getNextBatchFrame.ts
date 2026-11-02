import type { PackCard } from "@/packOpening/PackCard";

type Params = {
  packs: readonly (readonly PackCard[])[];
  index: number;
};

export function getNextBatchFrame({ packs, index }: Params) {
  const nextIndex = index + 1;
  if (nextIndex >= packs.length) {
    return { complete: true, index: nextIndex, cards: packs.flat() };
  }
  return { complete: false, index: nextIndex, cards: [...packs[nextIndex]!] };
}
