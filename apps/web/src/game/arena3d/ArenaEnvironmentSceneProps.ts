import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import type { Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";

export type ArenaEnvironmentSceneProps = {
  colors: ArenaSideColors;
  ripples: ArenaRippleBuffer;
  activeSide: number;
  energy: { current: number };
  artSrc: string | undefined;
  reducedMotion: boolean;
  quality: Arena3dQualityEntry;
};
