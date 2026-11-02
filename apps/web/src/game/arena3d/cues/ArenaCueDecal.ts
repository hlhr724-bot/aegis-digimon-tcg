import type { ArenaCueDecalKindEntry } from "@/game/arena3d/cues/ArenaCueDecalKind";

export type ArenaCueDecal = {
  kind: ArenaCueDecalKindEntry;
  x: number;
  z: number;
  width: number;
  yaw: number;
  color: string;
  progress: number;
  strength: number;
};
