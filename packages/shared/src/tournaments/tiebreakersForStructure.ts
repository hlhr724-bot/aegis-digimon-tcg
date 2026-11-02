import type { TournamentStructure } from "#shared/tournaments/index";
import { TournamentTiebreaker } from "#shared/tournaments/TournamentTiebreaker";

export function tiebreakersForStructure(structure: TournamentStructure): TournamentTiebreaker[] {
  return Object.values(TournamentTiebreaker)
    .filter((entry) => (structure === "round_robin" ? entry.roundRobin : structure === "swiss" && entry.swiss))
    .map((entry) => entry.value);
}
