import { Arena3dQuality, type Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";

const MEGABYTE = 1024 * 1024;

export const ARENA_3D_TOUCH_QUALITY: Readonly<Record<Arena3dQuality, Arena3dQualityEntry>> = {
  [Arena3dQuality.LOW.value]: {
    ...Arena3dQuality.LOW,
    maxDpr: 1.5,
    textureBudgetBytes: 32 * MEGABYTE,
  },
  [Arena3dQuality.MEDIUM.value]: {
    ...Arena3dQuality.MEDIUM,
    maxDpr: 2,
    antialias: false,
    textureBudgetBytes: 64 * MEGABYTE,
    floorSegments: 64,
    moteCount: 60,
    shardCount: 4,
  },
  [Arena3dQuality.HIGH.value]: {
    ...Arena3dQuality.HIGH,
    maxDpr: 3,
    textureBudgetBytes: 112 * MEGABYTE,
    floorSegments: 96,
    moteCount: 140,
    shardCount: 6,
  },
};
