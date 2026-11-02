import type { MatchupGameResult } from "#shared/deckSimulation/MatchupGameResult";
import type { MatchupJobStatus } from "#shared/deckSimulation/MatchupJobStatus";

export interface MatchupSampleGame {
  index: number;
  opponentIndex: number;
  wentFirst: boolean;
  result: MatchupGameResult;
  reason: string;
  turns: number;
}

export interface MatchupTally {
  requestedGames: number;
  completedGames: number;
  wins: number;
  losses: number;
  draws: number;
  invalidGames: number;
  score: number | null;
  interval: readonly [number, number] | null;
}

export interface MatchupOpponentResult extends MatchupTally {
  name: string;
  communityDeckId?: string;
}

export interface MatchupJob extends MatchupTally {
  id: string;
  status: MatchupJobStatus;
  opponents: MatchupOpponentResult[];
  samples: MatchupSampleGame[];
  createdAt: string;
  expiresAt: string;
}
