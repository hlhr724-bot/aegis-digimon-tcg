import { useSyncExternalStore } from "react";
import { MatchLogDisplay } from "@/game/log/MatchLogDisplay";
import { matchLogDisplayPreference } from "@/game/log/matchLogDisplayPreference";

type MatchLogDisplayEntry = (typeof MatchLogDisplay)[keyof typeof MatchLogDisplay];

export function useMatchLogDisplay(): MatchLogDisplayEntry {
  const value = useSyncExternalStore(
    matchLogDisplayPreference.subscribe,
    matchLogDisplayPreference.get,
    () => MatchLogDisplay.POPUPS.value,
  );
  return Object.values(MatchLogDisplay).find((entry) => entry.value === value) ?? MatchLogDisplay.POPUPS;
}
