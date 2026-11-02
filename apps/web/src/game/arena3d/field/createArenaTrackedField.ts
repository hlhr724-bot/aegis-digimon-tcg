import type { ArenaTrackedField } from "@/game/arena3d/field/ArenaTrackedField";

export function createArenaTrackedField(): ArenaTrackedField {
  return {
    permanents: new Map(),
    zones: new Map(),
    playDropSides: new Set(),
    focus: { permanentId: undefined, level: 0 },
  };
}
