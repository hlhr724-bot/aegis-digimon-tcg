import type { Seat } from "@aegis/shared/schema/enums";
import type { Decklist } from "#api/engine/setup";
import type { HeuristicProgram } from "#api/bot/evolution/heuristic";
import type { SearchReport } from "#api/bot/evolution/mcts";
import type { SeenOpponentCards } from "#api/bot/evolution/SeenOpponentCards";

export type MctsResidualMatchOptions = {
  seed: number;
  learnerSeat: Seat;
  decks: readonly [Decklist, Decklist];
  program: HeuristicProgram;
  opponentProgram?: HeuristicProgram;
  searchSeat?: Seat;
  simulations: number;
  exploration?: number;
  maxSearchTimeMs?: number;
  rolloutTurns?: number;
  maxRolloutDecisions?: number;
  moveOrderingProgram?: HeuristicProgram;
  searchSeed: number;
  seenOpponentCards?: SeenOpponentCards;
  maxSearches?: number;
  startAfterDecisions?: number;
  turnLimit?: number;
  signal?: AbortSignal;
  captureTraces?: boolean;
  onSearch?: (report: SearchReport & { seat: Seat; elapsedMs: number }) => void;
};
