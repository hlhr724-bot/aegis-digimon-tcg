import type { MatchupGameOutcome } from "#api/deckSimulation/MatchupGameOutcome";
import type { MatchupJobTask } from "#api/deckSimulation/MatchupJobTask";

export type MatchupJobEnd = "completed" | "timed-out" | "cancelled";

export type MatchupWorkerRequest = { type: "run"; task: MatchupJobTask } | { type: "cancel"; jobId: string };

export type MatchupWorkerMessage =
  | { type: "ready" }
  | { type: "game"; jobId: string; index: number; playerFirst: boolean; outcome: MatchupGameOutcome }
  | { type: "finished"; jobId: string; end: MatchupJobEnd }
  | { type: "failed"; jobId: string; error: string };
