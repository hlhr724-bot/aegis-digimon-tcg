import type { TournamentStructure } from "@aegis/shared/tournaments/index";
import { playsScoredRounds } from "@aegis/shared/tournaments/playsScoredRounds";
import { CloseCheckInOutcome } from "@/tournaments/CloseCheckInOutcome";

const MINIMUM_ELIMINATION_FIELD = 2;

type CloseCheckInOutcomeParams = {
  structure: TournamentStructure;
  checkedIn: number;
};

export function getCloseCheckInOutcome({ structure, checkedIn }: CloseCheckInOutcomeParams): CloseCheckInOutcome {
  if (checkedIn === 0 && playsScoredRounds(structure)) {
    return CloseCheckInOutcome.BLOCKED.value;
  }
  if (structure === "single_elimination" && checkedIn < MINIMUM_ELIMINATION_FIELD) {
    return CloseCheckInOutcome.CANCEL.value;
  }
  return CloseCheckInOutcome.START.value;
}
