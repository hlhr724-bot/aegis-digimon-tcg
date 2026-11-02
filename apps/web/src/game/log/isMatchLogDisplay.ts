import { MatchLogDisplay } from "@/game/log/MatchLogDisplay";

export function isMatchLogDisplay(value: unknown): value is MatchLogDisplay {
  return typeof value === "string" && Object.values(MatchLogDisplay).some((entry) => entry.value === value);
}
