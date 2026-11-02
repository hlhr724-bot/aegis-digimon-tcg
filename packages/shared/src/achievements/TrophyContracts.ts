import type { TrophyAward } from "#shared/achievements/TrophyAward";
import type { TrophySourceKind } from "#shared/achievements/TrophySourceKind";
import type { TrophyTier } from "#shared/achievements/TrophyTier";

export type TrophySource =
  | { kind: typeof TrophySourceKind.TOURNAMENT.value; tournamentId: string; name: string }
  | { kind: typeof TrophySourceKind.TOURNAMENT_CIRCUIT.value; circuitId: string; name: string };

export type Trophy = {
  award: TrophyAward;
  tier: TrophyTier;
  source: TrophySource;
  awardedAt: number;
};

export type TrophyCabinet = { items: Trophy[] };
