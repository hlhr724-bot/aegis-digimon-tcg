import type { TournamentStructure } from "#shared/tournaments/index";

export function playsScoredRounds(
  structure: string,
): structure is Extract<TournamentStructure, "swiss" | "round_robin"> {
  return structure === "swiss" || structure === "round_robin";
}
