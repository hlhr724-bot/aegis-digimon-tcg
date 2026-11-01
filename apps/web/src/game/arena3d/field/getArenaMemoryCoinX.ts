import { ARENA_MEMORY_TRACK } from "@/game/arena3d/field/arenaWorldLayout";
import { clampMemory } from "@/game/memoryArc";

export function getArenaMemoryCoinX(memory: number): number {
  return -clampMemory(memory) * ARENA_MEMORY_TRACK.coinSpacing;
}
