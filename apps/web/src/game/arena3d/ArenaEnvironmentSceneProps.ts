import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";

export type ArenaEnvironmentSceneProps = {
  colors: ArenaSideColors;
  ripples: ArenaRippleBuffer;
  activeSide: number;
  energy: { current: number };
  artSrc: string | undefined;
  reducedMotion: boolean;
};
