import type { Arena3dDeviceClassEntry } from "@/game/arena3d/quality/Arena3dDeviceClass";
import { Arena3dQuality, type Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";
import { AUTO_ARENA_3D_QUALITY, type Arena3dQualityChoice } from "@/game/arena3d/quality/Arena3dQualityChoice";
import { ARENA_3D_TOUCH_QUALITY } from "@/game/arena3d/quality/arena3dTouchQuality";
import { findArena3dQualityEntry } from "@/game/arena3d/quality/findArena3dQualityEntry";
import { readArena3dDeviceClass } from "@/game/arena3d/quality/readArena3dDeviceClass";

type Params = {
  choice: Arena3dQualityChoice;
  probed: Arena3dQuality | undefined;
  downgrades: number;
  deviceClass?: Arena3dDeviceClassEntry;
};

function findTier({ choice, probed, downgrades }: Params): Arena3dQualityEntry {
  if (choice !== AUTO_ARENA_3D_QUALITY) {
    return findArena3dQualityEntry(choice) ?? Arena3dQuality.MEDIUM;
  }
  const start = findArena3dQualityEntry(probed) ?? Arena3dQuality.MEDIUM;
  const rank = Math.max(0, start.rank - downgrades);
  return Object.values(Arena3dQuality).find((entry) => entry.rank === rank) ?? Arena3dQuality.LOW;
}

export function resolveArena3dQuality(params: Params): Arena3dQualityEntry {
  const tier = findTier(params);
  const deviceClass = params.deviceClass ?? readArena3dDeviceClass();
  return deviceClass.touchFirst ? ARENA_3D_TOUCH_QUALITY[tier.value] : tier;
}
