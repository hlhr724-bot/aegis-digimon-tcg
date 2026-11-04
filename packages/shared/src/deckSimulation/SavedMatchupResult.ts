import type { MatchupJob } from "#shared/deckSimulation/MatchupJob";

export interface SavedMatchupResult {
  deckKey: string;
  savedAt: string;
  job: MatchupJob;
}
