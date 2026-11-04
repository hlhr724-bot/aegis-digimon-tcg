import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";

export type FinishedMatchup = {
  accountId: string;
  deckId: string;
  deckKey: string;
  job: MatchupJob;
};
