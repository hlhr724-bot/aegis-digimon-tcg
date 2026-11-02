import type { Seat } from "@aegis/shared/schema/enums";
import type { BotProfile } from "#api/bot/profiles";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import type { HeuristicProgram } from "#api/bot/evolution/heuristic";
import type { SearchReport } from "#api/bot/evolution/mcts";
import type { SeenOpponentCards } from "#api/bot/evolution/SeenOpponentCards";
import type { TrainingWindow } from "#api/bot/training/policy";

export type BotSearchTask = {
  snapshot: GameEngineSnapshot;
  randomKey?: string;
  root: TrainingWindow;
  seat: Seat;
  program: HeuristicProgram;
  opponentProgram: HeuristicProgram;
  profile: BotProfile;
  simulations: number;
  candidateLimit: number;
  deadlineEpochMs: number;
  seed: number;
  rootPriors: readonly number[];
  seenOpponentCards: SeenOpponentCards;
};

export type BotSearchResult = { action: number; report: SearchReport };
