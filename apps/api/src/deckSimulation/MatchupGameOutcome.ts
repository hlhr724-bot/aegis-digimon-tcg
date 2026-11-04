import type { MatchupGameResult } from "@aegis/shared/deckSimulation/MatchupGameResult";
import type { ReplayRecord } from "#api/replays/inputs/types";

export type MatchupGameOutcome = {
  result: MatchupGameResult | undefined;
  reason: string;
  turns: number;
  replay?: ReplayRecord;
};
