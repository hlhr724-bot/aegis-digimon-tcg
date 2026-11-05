import type { ScreenPoint } from "@/game/arena3d/ArenaPulse";
import type { ArenaZoneKey } from "@/game/arena3d/field/arenaWorldLayout";

export type ArenaPulseAnchor = {
  permanentId?: string;
  zoneKey?: ArenaZoneKey;
  boardPoint?: ScreenPoint;
  locate?: () => ScreenPoint | undefined;
};
