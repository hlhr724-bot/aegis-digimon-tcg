import { Phase } from "@aegis/shared/schema/enums";
import { mainActionReady } from "#api/bot/training/actions";
import { hasUnsupportedReplayKnowledge } from "#api/bot/evolution/hasUnsupportedReplayKnowledge";
import { createHash } from "node:crypto";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { runReplay } from "#api/replays/inputs/run";
import { getReplaySearchWindow } from "#api/bot/evolution/getReplaySearchWindow";
import { informationKey } from "#api/bot/evolution/mcts";
import { chooseHeuristic, rankHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { teacherActionIndex } from "#api/bot/training/teacher";
import { validateDecklist } from "#api/engine/deckValidation";

type Params = {
  record: ReplayRecord;
  program: HeuristicProgram;
  capturePositions?: boolean;
  expected: { winnerSeat: number | null; reason: string; turn: number };
};

export async function inspectReplayTeacherInput(input: Params) {
  if (
    input.record.rules.unlimited ||
    input.record.rules.devScenario ||
    input.record.inputs.some((entry) => entry.kind === "startScenarioFixture" || entry.kind === "startDevScenario")
  ) {
    throw new Error("Teacher requires an ordinary limited match");
  }
  if (
    !input.record.seats.every((seat) => validateDecklist(seat.deck).ok) ||
    input.record.seats.every((seat) => seat.bot)
  ) {
    throw new Error("Teacher requires legal decks and at least one human seat");
  }
  const positions: {
    inputIndex: number;
    seat: 0 | 1;
    information: string;
    baseline: number;
    chosen: number;
    priority: number;
    margin: number;
    hash: string;
  }[] = [];
  let terminal: Params["expected"] | undefined;
  let knowledgeUnsupported = false;
  const run = await runReplay(input.record, {
    stopOnDivergence: true,
    onBatch: (state, events) => {
      for (const event of events) {
        if (event.kind === "matchStarted") {
          knowledgeUnsupported = false;
        }
        if (hasUnsupportedReplayKnowledge(event)) {
          knowledgeUnsupported = true;
        }
        if (event.kind === "gameOver") {
          terminal = {
            winnerSeat: event.result.outcome === "draw" ? null : event.result.winnerSeat,
            reason: event.reason,
            turn: state.turnCount,
          };
        }
      }
    },
    onDecision: (request) => {
      if ((request.options?.visibleCards?.length ?? 0) > 0) {
        knowledgeUnsupported = true;
      }
    },
    beforeInput: (entry, inputIndex, engine) => {
      if (input.capturePositions === false) {
        return;
      }
      if (
        knowledgeUnsupported ||
        entry.kind !== "intent" ||
        entry.ok !== true ||
        input.record.seats[entry.seat].bot ||
        !["playCard", "digivolve", "attack", "endPhase", "dnaDigivolve", "linkCard", "appFusion"].includes(
          entry.intent.type,
        )
      ) {
        return;
      }
      if (
        engine.state.phase !== Phase.Main ||
        !mainActionReady(engine) ||
        engine.state.pendingDecision ||
        engine.state.combatWindow ||
        engine.state.turnSeat !== entry.seat
      ) {
        return;
      }
      const window = getReplaySearchWindow({ engine, seat: entry.seat });
      const chosen = teacherActionIndex(window, entry.intent);
      if (chosen === undefined || window.actions.length < 2) {
        return;
      }
      const baseline = chooseHeuristic(input.program, window, 0);
      const ranking = rankHeuristic(input.program, window);
      const types = new Set(window.actions.map((action) => action.intent.type));
      const priority =
        chosen !== baseline
          ? 0
          : Number(
              !(types.has("attack") && (types.has("playCard") || types.has("digivolve") || types.has("endPhase"))),
            ) + 1;
      positions.push({
        inputIndex,
        seat: entry.seat,
        information: informationKey(window),
        chosen,
        baseline,
        priority,
        margin: ranking[0]!.score - ranking[1]!.score,
        hash: createHash("sha256").update(`${input.record.matchId}:${inputIndex}`).digest("hex"),
      });
    },
  });
  if (
    run.divergences.length ||
    !run.state.gameOver ||
    !terminal ||
    terminal.winnerSeat !== input.expected.winnerSeat ||
    terminal.reason !== input.expected.reason ||
    terminal.turn !== input.expected.turn
  ) {
    throw new Error("Replay does not reproduce the recorded terminal outcome, reason and turn");
  }
  return { terminal, positions };
}
