import { Phase, type Intent, type Seat } from "@aegis/shared";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { mainActionReady, mainActions } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import { teacherActionIndex } from "#api/bot/training/teacher";
import type { TrainingWindow } from "#api/bot/training/policy";
import type { GameEngine } from "#api/engine/GameEngine";

export type ReplayAdvisor = (engine: GameEngine, seat: Seat, window: TrainingWindow) => Intent | number;
export type ReplayScorer = (engine: GameEngine, seat: Seat, window: TrainingWindow) => (number | null)[];

export interface ReplayPosition {
  inputIndex: number;
  seat: Seat;
  bot: boolean;
  turn: number;
  chosen: number | null;
  intent: Intent;
  advice: Record<string, number | null>;
  scores: Record<string, (number | null)[]>;
  window: TrainingWindow;
}

export interface ReplayPositions {
  matchId: string;
  winnerSeat: Seat | null;
  bots: [boolean, boolean];
  firstDivergence: number | null;
  applied: number;
  inputs: number;
  positions: ReplayPosition[];
}

const NON_MAIN_INTENTS = new Set(["ready", "mulligan", "respondDecision", "surrender", "concede"]);

export async function replayPositions(
  record: ReplayRecord,
  advisors: Record<string, ReplayAdvisor> = {},
  scorers: Record<string, ReplayScorer> = {},
): Promise<ReplayPositions> {
  const positions: ReplayPosition[] = [];
  const run = await runReplay(record, {
    stopOnDivergence: true,
    beforeInput: (input, inputIndex, engine) => {
      if (input.kind !== "intent" || NON_MAIN_INTENTS.has(input.intent.type)) return;
      const state = engine.state;
      if (
        state.gameOver ||
        state.phase !== Phase.Main ||
        state.turnSeat !== input.seat ||
        state.pendingDecision !== undefined ||
        state.combatWindow !== undefined ||
        !mainActionReady(engine)
      )
        return;
      const window: TrainingWindow = {
        observation: trainingObservation(state, input.seat),
        kind: "main",
        selected: [],
        actions: mainActions(engine, input.seat),
      };
      positions.push({
        inputIndex,
        seat: input.seat,
        bot: record.seats[input.seat]?.bot === true,
        turn: state.turnCount,
        chosen: teacherActionIndex(window, input.intent) ?? null,
        intent: input.intent,
        advice: Object.fromEntries(
          Object.entries(advisors).map(([name, advise]) => {
            const choice = advise(engine, input.seat, window);
            return [name, typeof choice === "number" ? choice : (teacherActionIndex(window, choice) ?? null)];
          }),
        ),
        scores: Object.fromEntries(
          Object.entries(scorers).map(([name, score]) => [name, score(engine, input.seat, window)]),
        ),
        window,
      });
    },
  });
  const firstDivergence = run.divergences[0]?.index ?? null;
  return {
    matchId: record.matchId,
    winnerSeat: run.state.gameOver && run.state.winnerSeat >= 0 ? (run.state.winnerSeat as Seat) : null,
    bots: [record.seats[0]?.bot === true, record.seats[1]?.bot === true],
    firstDivergence,
    applied: run.applied,
    inputs: record.inputs.length,
    positions:
      firstDivergence === null ? positions : positions.filter((position) => position.inputIndex < firstDivergence),
  };
}
