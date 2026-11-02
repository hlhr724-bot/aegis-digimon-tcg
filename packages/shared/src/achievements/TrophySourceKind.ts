export const TrophySourceKind = {
  TOURNAMENT: { name: "TOURNAMENT", value: "tournament" },
  TOURNAMENT_CIRCUIT: { name: "TOURNAMENT_CIRCUIT", value: "tournament_circuit" },
} as const;

export type TrophySourceKind = (typeof TrophySourceKind)[keyof typeof TrophySourceKind]["value"];
