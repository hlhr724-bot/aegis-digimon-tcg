import { MatchFinaleTone } from "@/game/match/finale/MatchFinaleTone";

export type MatchFinaleToneEntry = (typeof MatchFinaleTone)[keyof typeof MatchFinaleTone];

const ENTRIES: readonly MatchFinaleToneEntry[] = Object.values(MatchFinaleTone);

export function findMatchFinaleTone(value: MatchFinaleTone): MatchFinaleToneEntry {
  return ENTRIES.find((entry) => entry.value === value) ?? MatchFinaleTone.WITNESS;
}
