import { BOOSTER_BOX_PACK_COUNT, type BoosterProgress } from "@/packOpening/BoosterProgress";
import type { PackCard } from "@/packOpening/PackCard";

type Params = {
  progress: BoosterProgress;
  setId: string;
  packs: readonly (readonly PackCard[])[];
  openedAt: number;
};

export function appendOpenedPacks({ progress, setId, packs, openedAt }: Params): BoosterProgress {
  const current = progress.activeBox?.setId === setId ? progress.activeBox : { setId, packs: [] };
  const remaining = BOOSTER_BOX_PACK_COUNT - current.packs.length;
  if (packs.length === 0 || packs.length > remaining || packs.some((pack) => pack.length !== 12)) {
    return progress;
  }
  const entries = packs.map((cards) => ({ openedAt, cards: cards.map(({ cardId, artId }) => ({ cardId, artId })) }));
  return { version: 2, activeBox: { ...current, setId, packs: [...current.packs, ...entries] } };
}
