import { ArenaLayoutVariant, type ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";

type Params = {
  portrait: boolean;
  width: number;
  height: number;
};

const SHORT_ASPECT_RATIO = 2.75;

export function selectArenaLayoutVariant({ portrait, width, height }: Params): ArenaLayoutVariantEntry {
  if (portrait) {
    return ArenaLayoutVariant.TALL;
  }
  if (width / Math.max(1, height) >= SHORT_ASPECT_RATIO) {
    return ArenaLayoutVariant.SHORT;
  }
  return ArenaLayoutVariant.WIDE;
}
