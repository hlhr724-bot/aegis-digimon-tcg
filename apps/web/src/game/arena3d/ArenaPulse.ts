import type { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import type { Side } from "@/game/side";

export type ScreenPoint = { x: number; y: number };

export type ArenaPulse = {
  key: string;
  kind: ArenaPulseKind;
  color: string;
  side: Side;
  screenPoint?: ScreenPoint;
  targetPoint?: ScreenPoint;
};
