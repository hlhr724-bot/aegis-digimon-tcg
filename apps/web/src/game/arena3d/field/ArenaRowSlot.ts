import type { Permanent } from "@aegis/shared";
import type { Side } from "@/game/side";

export type ArenaRowSlot = {
  fieldKey: string;
  side: Side;
  permanent: Permanent;
  members: readonly Permanent[];
  x: number;
  z: number;
  width: number;
  suspended: boolean;
  sourceCount: number;
  linkCount: number;
  column: number | undefined;
};
