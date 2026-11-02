import { TrophySourceKind } from "#shared/achievements/TrophySourceKind";
import { TrophyTier } from "#shared/achievements/TrophyTier";

export const TrophyAward = {
  TOURNAMENT_CHAMPION: {
    name: "TOURNAMENT_CHAMPION",
    value: "tournament_champion",
    sourceKind: TrophySourceKind.TOURNAMENT.value,
    tournamentPlacement: "champion",
    tier: TrophyTier.GOLD.value,
  },
  TOURNAMENT_TOP_FOUR: {
    name: "TOURNAMENT_TOP_FOUR",
    value: "tournament_top_four",
    sourceKind: TrophySourceKind.TOURNAMENT.value,
    tournamentPlacement: "top_four",
    tier: TrophyTier.SILVER.value,
  },
  TOURNAMENT_TOP_EIGHT: {
    name: "TOURNAMENT_TOP_EIGHT",
    value: "tournament_top_eight",
    sourceKind: TrophySourceKind.TOURNAMENT.value,
    tournamentPlacement: "top_eight",
    tier: TrophyTier.BRONZE.value,
  },
  CIRCUIT_CHAMPION: {
    name: "CIRCUIT_CHAMPION",
    value: "circuit_champion",
    sourceKind: TrophySourceKind.TOURNAMENT_CIRCUIT.value,
    maxPosition: 1,
    tier: TrophyTier.RAINBOW.value,
  },
  CIRCUIT_TOP_FOUR: {
    name: "CIRCUIT_TOP_FOUR",
    value: "circuit_top_four",
    sourceKind: TrophySourceKind.TOURNAMENT_CIRCUIT.value,
    maxPosition: 4,
    tier: TrophyTier.GOLD.value,
  },
  CIRCUIT_TOP_EIGHT: {
    name: "CIRCUIT_TOP_EIGHT",
    value: "circuit_top_eight",
    sourceKind: TrophySourceKind.TOURNAMENT_CIRCUIT.value,
    maxPosition: 8,
    tier: TrophyTier.SILVER.value,
  },
} as const;

export type TrophyAward = (typeof TrophyAward)[keyof typeof TrophyAward]["value"];
