import { useSyncExternalStore } from "react";
import { arenaInputPreference } from "@/game/input/arenaInputPreference";

export function useArenaInputEnabled() {
  return useSyncExternalStore(arenaInputPreference.subscribe, arenaInputPreference.isEnabled, () => false);
}
