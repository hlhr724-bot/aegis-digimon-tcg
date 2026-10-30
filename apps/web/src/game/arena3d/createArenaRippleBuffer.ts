import { Color, Vector4 } from "three";
import { RIPPLE_SLOTS } from "@/game/arena3d/arenaSceneLayout";

export type ArenaRippleBuffer = {
  ripples: Vector4[];
  colors: Color[];
  next: number;
  sweepStart: number;
  sweepDirection: number;
  sweepColor: Color;
};

export function createArenaRippleBuffer(): ArenaRippleBuffer {
  return {
    ripples: Array.from({ length: RIPPLE_SLOTS }, () => new Vector4(0, 0, -100, 0)),
    colors: Array.from({ length: RIPPLE_SLOTS }, () => new Color()),
    next: 0,
    sweepStart: -100,
    sweepDirection: 1,
    sweepColor: new Color(),
  };
}
