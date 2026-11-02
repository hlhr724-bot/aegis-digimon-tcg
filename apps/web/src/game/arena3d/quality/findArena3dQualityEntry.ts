import { Arena3dQuality, type Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";

export function findArena3dQualityEntry(value: unknown): Arena3dQualityEntry | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return Object.values(Arena3dQuality).find((entry) => entry.value === value);
}
