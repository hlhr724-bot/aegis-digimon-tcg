import { performance } from "node:perf_hooks";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { Seat } from "@aegis/shared/schema/enums";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { runReplay } from "#api/replays/inputs/run";
import { actionCardId, actionFeatures, chooseHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { getReplaySearchWindow } from "#api/bot/evolution/getReplaySearchWindow";
import { informationKey, searchMcts } from "#api/bot/evolution/mcts";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";

const TEACHER_SIMULATIONS = 32;
const TEACHER_SEARCH_MS = 180000;
const TEACHER_SIMULATION_MS = 60000;

type Params = {
  record: ReplayRecord;
  inputIndex: number;
  seat: Seat;
  expectedInformation: string;
  program: HeuristicProgram;
  seed: number;
  signal?: AbortSignal;
};

export async function runReplayTeacher(input: Params) {
  const run = await runReplay(input.record, { untilInput: input.inputIndex, stopOnDivergence: true });
  if (run.divergences.length > 0) {
    throw new Error("Teacher prefix diverged");
  }
  const root = getReplaySearchWindow({ engine: run.engine, seat: input.seat });
  if (informationKey(root) !== input.expectedInformation || root.actions.length < 2) {
    throw new Error("Teacher root changed or has no alternatives");
  }
  const visibleActions = root.actions.map((action, index) => {
    const cardId = actionCardId(root, index);
    const card = cardId === undefined ? undefined : getCardDefinition(cardId);
    return {
      index,
      label: action.label,
      features: actionFeatures(root, index),
      card:
        card === undefined
          ? undefined
          : { cardId, name: card.nameEn, effect: card.effectText, inherited: card.inheritedEffectText },
    };
  });
  const context = { observation: root.observation, actions: visibleActions };
  const baseline = chooseHeuristic(input.program, root, 0);
  const started = performance.now();
  const search = await searchMcts({
    root,
    seat: input.seat,
    simulations: TEACHER_SIMULATIONS,
    maxDurationMs: TEACHER_SEARCH_MS,
    signal: input.signal,
    rolloutChoose: (window) => chooseHeuristic(input.program, window, input.seed),
    simulate: (choose, simulation) =>
      runReplayContinuation({
        ...input,
        sampleSeed: input.seed + simulation,
        choose,
        maxDurationMs: Math.max(1, Math.min(TEACHER_SIMULATION_MS, TEACHER_SEARCH_MS - (performance.now() - started))),
      }),
  });
  const alternative = search.report.root.find((entry) => entry.action !== baseline && entry.visits > 0)?.action;
  return { context, search: search.report, baseline, alternative: alternative ?? null, preference: null };
}
