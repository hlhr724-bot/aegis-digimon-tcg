import type { BoosterProgress } from "@/packOpening/BoosterProgress";

export function startBoosterBox(setId: string): BoosterProgress {
  return { version: 2, activeBox: { setId, packs: [] } };
}
