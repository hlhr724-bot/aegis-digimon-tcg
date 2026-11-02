import type { Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import type { Decklist } from "../../engine/setup.js";
import { runBotMatch } from "../matchHarness.js";
import { createProjectedEvaluationPolicy } from "../projectedPolicy.js";
import { mainActionReady } from "../training/actions.js";
import { validEvolutionGame } from "./evolutionMatch.js";
import type { HeuristicProgram } from "./heuristic.js";
import { createResidualPolicy } from "./residualPolicy.js";

/** Same engine, action cap and seeded tie jitter for the candidate and current default control. */
export async function runResidualMatch(input: {
  seed: number;
  learnerSeat: Seat;
  decks: readonly [Decklist, Decklist];
  program: HeuristicProgram;
  opponent?: "balanced" | "heuristic";
  opponentProgram?: HeuristicProgram;
  turnLimit?: number;
  captureTraces?: boolean;
}) {
  if ((input.opponent ?? "balanced") === "balanced" && input.opponentProgram !== undefined)
    throw new Error("Balanced comparison cannot override the control policy");
  const traces: unknown[] = [];
  let decisions = 0;
  const seats = input.decks.map((deck, index) => ({
    deck,
    canChooseMainAction: mainActionReady,
    policyFactory(engine: GameEngine, seat: Seat) {
      const program = index === input.learnerSeat ? input.program : input.opponentProgram;
      const seed = input.seed + seat * 7919;
      if (!program) return createProjectedEvaluationPolicy({ engine, seat, seed });
      return createResidualPolicy({
        engine,
        seat,
        seed,
        program,
        onDecision:
          index === input.learnerSeat
            ? (trace) => {
                decisions++;
                if (input.captureTraces) {
                  traces.push(trace);
                  if (traces.length > 200) traces.shift();
                }
              }
            : undefined,
      });
    },
  }));
  const result = await runBotMatch({
    seed: input.seed,
    seats: [seats[0]!, seats[1]!],
    turnLimit: input.turnLimit ?? 60,
    captureEvents: true,
    verifyProjections: true,
  });
  return { result, valid: validEvolutionGame(result), decisions, traces, searches: [] };
}
