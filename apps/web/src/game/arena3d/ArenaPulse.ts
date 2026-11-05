import type { ArenaPulseAnchor } from "@/game/arena3d/ArenaPulseAnchor";
import type { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import type { Side } from "@/game/side";

export type ScreenPoint = { x: number; y: number };

export type ArenaPulse = {
  key: string;
  kind: ArenaPulseKind;
  color: string;
  side: Side;
  origin?: ArenaPulseAnchor;
  target?: ArenaPulseAnchor;
  permanentId?: string;
  targetPermanentId?: string;
};
