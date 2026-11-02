import { performance } from "node:perf_hooks";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import { shuffleInPlace, makeRng } from "#api/engine/setup";
import { runBotMatch } from "#api/bot/matchHarness";
import { buildBotView } from "#api/bot/view";
import { mainActionReady, mainActions } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";
import { createRecordedResidualPolicy } from "#api/bot/evolution/createRecordedResidualPolicy";
import { validEvolutionGame } from "#api/bot/evolution/evolutionMatch";
import { informationKey, searchMcts, type SearchReport } from "#api/bot/evolution/mcts";
import type { MctsResidualMatchOptions } from "#api/bot/evolution/MctsResidualMatchOptions";
import type { RecordedResidualChoice } from "#api/bot/evolution/RecordedResidualChoice";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { orderMctsActions } from "#api/bot/evolution/orderMctsActions";
import type { HeuristicProgram } from "#api/bot/evolution/heuristic";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";

function searchWindow(choice: RecordedResidualChoice, seed: number, program?: HeuristicProgram): TrainingWindow {
  const view = buildBotView(choice.engine.state, choice.seat);
  if (view === undefined) throw new Error("Residual search requires a seated observation");
  const actions = mainActions(choice.engine, choice.seat, {
    includeSpecialActions: false,
    digiXrosValidationBudget: 256,
  }).filter((action) => action.intent.type !== "activateEffect" && (action.projectedCost ?? 0) <= view.maxAffordable);
  const key = JSON.stringify(choice.baseline);
  const alternatives = actions.filter((action) => JSON.stringify(action.intent) !== key);
  shuffleInPlace(alternatives, makeRng(seed));
  const window: TrainingWindow = {
    observation: trainingObservation(choice.engine.state, choice.seat),
    kind: "main",
    selected: [],
    actions: [{ intent: choice.baseline, label: "Current residual policy" }, ...alternatives],
  };
  return program === undefined ? window : orderMctsActions({ window, program });
}

function searchable(choice: RecordedResidualChoice): boolean {
  return (
    choice.method === "chooseMainAction" &&
    choice.baseline.type !== "activateEffect" &&
    choice.engine.state.pendingDecision === undefined &&
    choice.engine.state.combatWindow === undefined
  );
}

export async function runMctsResidualMatch(options: MctsResidualMatchOptions) {
  if (options.moveOrderingProgram?.basePolicy !== undefined) {
    throw new Error("MCTS ordering requires a standalone heuristic program");
  }
  if (
    !Number.isSafeInteger(options.simulations) ||
    options.simulations < 0 ||
    options.simulations > 10000 ||
    (options.rolloutTurns !== undefined &&
      (!Number.isSafeInteger(options.rolloutTurns) || options.rolloutTurns < 1 || options.rolloutTurns > 200)) ||
    (options.maxRolloutDecisions !== undefined &&
      (!Number.isSafeInteger(options.maxRolloutDecisions) ||
        options.maxRolloutDecisions < 1 ||
        options.maxRolloutDecisions > 10000)) ||
    (options.exploration !== undefined && (!Number.isFinite(options.exploration) || options.exploration < 0)) ||
    (options.maxSearchTimeMs !== undefined &&
      (!Number.isFinite(options.maxSearchTimeMs) || options.maxSearchTimeMs <= 0)) ||
    [options.maxSearches, options.startAfterDecisions].some(
      (limit) => limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0),
    )
  ) {
    throw new Error("Invalid residual MCTS search budget");
  }
  const maxRolloutDecisions = options.maxRolloutDecisions ?? (options.rolloutTurns === undefined ? undefined : 64);
  const searchSeat = options.searchSeat ?? options.learnerSeat;
  if (searchSeat !== 0 && searchSeat !== 1) throw new Error("Residual search needs a valid seat");
  const programs = [SEED_RESIDUAL, SEED_RESIDUAL];
  programs[options.learnerSeat] = options.program;
  programs[options.learnerSeat === 0 ? 1 : 0] = options.opponentProgram ?? SEED_RESIDUAL;
  const transcript: Intent[] = [];
  const searches: (SearchReport & { seat: Seat; elapsedMs: number })[] = [];
  const traces: unknown[] = [];
  const searchFailures: string[] = [];
  const simulationFailures: { reason: string; failures: string[]; turn: number }[] = [];
  let snapshotRestorations = 0;
  const seatsFor = (choose: (choice: RecordedResidualChoice) => Promise<Intent>, live: boolean) =>
    options.decks.map((deck) => ({
      deck,
      canChooseMainAction: mainActionReady,
      policyTimeoutMs: live ? 600000 : 60000,
      policyFactory: (engine: RecordedResidualChoice["engine"], seat: Seat) =>
        createRecordedResidualPolicy({
          engine,
          seat,
          seed: options.seed + seat * 7919,
          program: programs[seat]!,
          choose: async (choice) => {
            try {
              return await choose(choice);
            } catch (error) {
              searchFailures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
              throw error;
            }
          },
          onDecision:
            live && options.captureTraces && seat === options.learnerSeat
              ? (trace) => {
                  traces.push({ baseline: trace });
                  if (traces.length > 200) traces.shift();
                }
              : undefined,
        }),
    }));
  const simulate = async (
    engineSnapshot: GameEngineSnapshot,
    root: TrainingWindow,
    choose: (window: TrainingWindow) => number,
    sampleSeed: number,
    signal: AbortSignal,
  ) => {
    snapshotRestorations++;
    let result;
    try {
      result = await runReplayContinuation({
        engineSnapshot: structuredClone(engineSnapshot),
        seat: searchSeat,
        expectedInformation: informationKey(root),
        sampleSeed,
        seenOpponentCards: options.seenOpponentCards,
        program: programs[searchSeat]!,
        opponentProgram: programs[searchSeat === 0 ? 1 : 0]!,
        rootWindow: root,
        choose,
        rolloutTurns: options.rolloutTurns,
        maxRolloutDecisions,
        turnLimit: options.turnLimit,
        signal,
      });
    } catch (error) {
      simulationFailures.push({
        reason: error instanceof Error ? (error.stack ?? error.message) : String(error),
        failures: [],
        turn: root.observation.turn,
      });
      return { valid: false, reward: 0, evaluatedLeaf: false };
    }
    if (!result.valid) {
      simulationFailures.push({ reason: result.reason, failures: result.failures, turn: result.turn });
    }
    return {
      valid: result.valid,
      reward: result.reward,
      evaluatedLeaf: result.reason === "rolloutCutoff",
    };
  };
  const seats = seatsFor(async (choice) => {
    let intent = choice.baseline;
    if (
      options.simulations > 0 &&
      choice.seat === searchSeat &&
      searchable(choice) &&
      transcript.length >= (options.startAfterDecisions ?? 0) &&
      searches.length < (options.maxSearches ?? Number.POSITIVE_INFINITY)
    ) {
      const root = searchWindow(choice, options.searchSeed + transcript.length, options.moveOrderingProgram);
      if (root.actions.length > 1) {
        let engineSnapshot: GameEngineSnapshot;
        try {
          engineSnapshot = snapshotGameEngine({ engine: choice.engine });
        } catch (error) {
          searchFailures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
          throw error;
        }
        const start = performance.now();
        const signal = choice.signal ?? new AbortController().signal;
        let leafEvaluations = 0;
        const search = await searchMcts({
          root,
          seat: searchSeat,
          simulations: options.simulations,
          exploration: options.exploration,
          maxDurationMs: options.maxSearchTimeMs,
          signal,
          rolloutChoose: () => 0,
          simulate: async (choose, simulation) => {
            const result = await simulate(
              engineSnapshot,
              root,
              choose,
              (options.searchSeed + transcript.length * 7919 + simulation * 104729) >>> 0,
              signal,
            );
            if (result.valid && result.evaluatedLeaf) {
              leafEvaluations++;
            }
            return result;
          },
        });
        intent = structuredClone(root.actions[search.action]!.intent);
        const report = {
          ...search.report,
          seat: searchSeat,
          elapsedMs: performance.now() - start,
          ...(maxRolloutDecisions === undefined ? {} : { leafEvaluations }),
        };
        searches.push(report);
        options.onSearch?.(report);
      }
    }
    transcript.push(structuredClone(intent));
    if (transcript.length > 10000) throw new Error("Residual MCTS match exceeded its decision budget");
    return intent;
  }, true);
  const result = await runBotMatch({
    seed: options.seed,
    seats: [seats[0]!, seats[1]!],
    turnLimit: options.turnLimit ?? 60,
    captureEvents: true,
    verifyProjections: true,
    signal: options.signal,
  });
  return {
    result,
    valid:
      validEvolutionGame(result) &&
      searches.every(
        (search) =>
          search.invalid === 0 &&
          (search.completed === search.requested || (search.completed > 0 && search.timeBudget?.exhausted === true)),
      ),
    decisions: transcript.length,
    traces,
    searches,
    snapshotRestorations,
    simulationFailures,
    searchFailures,
  };
}
