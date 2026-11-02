import type { MatchupGameResult } from "#shared/deckSimulation/MatchupGameResult";
import type { MatchupJobStatus } from "#shared/deckSimulation/MatchupJobStatus";

export interface MatchupSampleGame {
  index: number;
  wentFirst: boolean;
  result: MatchupGameResult;
  reason: string;
  turns: number;
}

export interface MatchupJob {
  id: string;
  status: MatchupJobStatus;
  opponentName: string;
  requestedGames: number;
  completedGames: number;
  wins: number;
  losses: number;
  draws: number;
  invalidGames: number;
  score: number | null;
  interval: readonly [number, number] | null;
  samples: MatchupSampleGame[];
  createdAt: string;
  expiresAt: string;
}
