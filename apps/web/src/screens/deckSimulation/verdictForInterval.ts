import { MatchupVerdict } from "@/screens/deckSimulation/MatchupVerdict";

const EVEN = 0.5;

export function verdictForInterval(interval: readonly [number, number]): MatchupVerdict {
  if (interval[0] > EVEN) return MatchupVerdict.FAVORED.value;
  if (interval[1] < EVEN) return MatchupVerdict.BEHIND.value;
  return MatchupVerdict.CLOSE.value;
}
