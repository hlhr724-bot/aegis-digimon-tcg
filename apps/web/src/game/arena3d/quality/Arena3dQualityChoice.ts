import type { Arena3dQuality } from "@/game/arena3d/quality/Arena3dQuality";

export const AUTO_ARENA_3D_QUALITY = "auto";

export type Arena3dQualityChoice = Arena3dQuality | typeof AUTO_ARENA_3D_QUALITY;
