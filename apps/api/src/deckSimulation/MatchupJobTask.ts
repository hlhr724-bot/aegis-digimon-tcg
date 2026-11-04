import type { MatchupRequest } from "#api/deckSimulation/MatchupRequest";

export type MatchupJobTask = {
  jobId: string;
  request: MatchupRequest;
  seed: number;
  sampleLimit: number;
  deadlineEpochMs: number;
};
