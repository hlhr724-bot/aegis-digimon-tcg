import { performance } from "node:perf_hooks";
import type { Seat, ServerEvent } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import type { Decklist } from "../../engine/testDecks.js";
import { runBotMatch, type MatchResult } from "../matchHarness.js";
import { mainActionReady, type TrainingAction } from "#api/bot/training/actions";
import { chooseFastHeuristic } from "#api/bot/evolution/chooseFastHeuristic";
import { createReplayMainActionSource } from "#api/bot/evolution/createReplayMainActionSource";
import { createAsyncTrainingPolicy, type TrainingWindow } from "../training/policy.js";
import { determinize } from "./determinize.js";
import { evaluateSearchPosition } from "#api/bot/evolution/evaluateSearchPosition";
import { trainingObservation } from "#api/bot/training/observation";
import {
  actionCardId,
  actionFeatures,
  chooseHeuristic,
  rankHeuristic,
  SEED_HEURISTIC,
  type HeuristicProgram,
} from "./heuristic.js";
import { actionKey, informationKey, searchMcts, type SearchReport } from "./mcts.js";

interface SearchRollout {
  seat: Seat;
  rolloutTurns?: number;
  maxRolloutDecisions?: number;
  omitHandAffordances: boolean;
}
interface RecordedChoice {
  seat: Seat;
  kind: string;
  information: string;
  action: string;
  actionIndex: number;
  mainActions?: readonly TrainingAction[];
}
export interface EvolutionMatchOptions {
  seed: number;
  decks: readonly [Decklist, Decklist];
  learnerSeat: Seat;
  program: HeuristicProgram;
  opponentProgram?: HeuristicProgram;
  mcts?: {
    simulations: number;
    seed: number;
    reusePrefixActions?: boolean;
    omitRolloutHandAffordances?: boolean;
    startAfterDecisions?: number;
    maxSearches?: number;
    rolloutTurns?: number;
    maxRolloutDecisions?: number;
  };
  teacher?: {
    simulations: number;
    seed: number;
    maxSearches: number;
    every: number;
    rolloutTurns?: number;
  };
  turnLimit?: number;
  captureTraces?: boolean;
  onSearch?: (report: SearchReport) => void;
}
export function validEvolutionGame(result: MatchResult): boolean {
  return (
    !result.timedOut &&
    result.reason !== "stalled" &&
    result.reason !== "cancelled" &&
    result.errors.length === 0 &&
    result.rejections.length === 0 &&
    !result.events?.some((event) => event.kind === "actionRejected") &&
    result.seats.every((seat) => seat.inferenceFallbacks.error === 0 && seat.inferenceFallbacks.timeout === 0)
  );
}

/** Reconstruct a live engine (including private ledgers/queued effects) by exact replay.
 * The prefix is restoration machinery, never supplied as an observation to search.
 * After restoration all rollout choices see filtered training observations only.
 */
export async function runEvolutionMatch(options: EvolutionMatchOptions) {
  for (const limit of [options.mcts?.startAfterDecisions, options.mcts?.maxSearches]) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0))
      throw new Error("MCTS scheduling limits must be non-negative safe integers");
  }
  for (const limit of [
    options.mcts?.rolloutTurns,
    options.mcts?.maxRolloutDecisions,
    options.teacher?.rolloutTurns,
    options.teacher?.simulations,
    options.teacher?.maxSearches,
    options.teacher?.every,
  ]) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000))
      throw new Error("MCTS rollout and teacher bounds must be integers from 1 to 10000");
  }
  const maxRolloutDecisions =
    options.mcts?.maxRolloutDecisions ?? (options.mcts?.rolloutTurns === undefined ? undefined : 64);
  const transcript: RecordedChoice[] = [];
  const traces: unknown[] = [];
  const searches: SearchReport[] = [];
  const restoration = {
    replays: 0,
    replayedWindows: 0,
    reusedActionIndices: 0,
    reusedMainCatalogs: 0,
    enumeratedMainCatalogs: 0,
    leafEvaluations: 0,
    prefixMs: 0,
    rolloutMs: 0,
    rolloutDecisions: 0,
  };
  const opponentSeat: Seat = options.learnerSeat === 0 ? 1 : 0;
  const pilots = [SEED_HEURISTIC, SEED_HEURISTIC];
  pilots[options.learnerSeat] = options.program;
  pilots[opponentSeat] = options.opponentProgram ?? SEED_HEURISTIC;
  const rollout = (seat: Seat, window: TrainingWindow): number =>
    chooseHeuristic(pilots[seat]!, window, options.seed + seat * 7919);
  const replayRollout = (seat: Seat, window: TrainingWindow): number =>
    options.mcts?.reusePrefixActions === false
      ? rollout(seat, window)
      : chooseFastHeuristic(pilots[seat]!, window, options.seed + seat * 7919);
  const replay = async (
    prefix: readonly RecordedChoice[],
    root: TrainingWindow,
    choose: (window: TrainingWindow) => number,
    sampleSeed: number,
    signal: AbortSignal,
    search: SearchRollout,
  ): Promise<{ reward: number; valid: boolean }> => {
    restoration.replays++;
    let rootDecisions = 0;
    let leafValue: number | undefined;
    let cursor = 0;
    let reachedRoot = false;
    let mismatch = false;
    const replayStarted = performance.now();
    let rootReachedAt: number | undefined;
    const control = new AbortController();
    const seats = options.decks.map((deck, index) => ({
      deck,
      policyTimeoutMs: 60000,
      canChooseMainAction: mainActionReady,
      maxMainPhaseActions: Number.POSITIVE_INFINITY,
      policyFactory: (engine: GameEngine, seat: Seat) =>
        createAsyncTrainingPolicy(
          engine,
          seat,
          async (window) => {
            if (cursor > 10000) {
              mismatch = true;
              control.abort();
              return replayRollout(seat, window);
            }
            const entry = prefix[cursor++];
            if (entry !== undefined) {
              const reuseIndex = options.mcts?.reusePrefixActions !== false;
              const action = reuseIndex
                ? entry.actionIndex
                : window.actions.findIndex((_, actionIndex) => actionKey(window, actionIndex) === entry.action);
              if (
                entry.seat !== seat ||
                entry.information !== informationKey(window) ||
                action < 0 ||
                action >= window.actions.length ||
                (reuseIndex && actionKey(window, action) !== entry.action)
              ) {
                mismatch = true;
                control.abort();
                return replayRollout(seat, window);
              }
              restoration.replayedWindows++;
              if (reuseIndex) restoration.reusedActionIndices++;
              return action;
            }
            if (!reachedRoot) {
              if (seat !== search.seat || informationKey(window) !== informationKey(root)) {
                mismatch = true;
                control.abort();
                return replayRollout(seat, window);
              }
              reachedRoot = true;
              rootReachedAt = performance.now();
              await determinize(engine, search.seat, sampleSeed);
            }
            restoration.rolloutDecisions++;
            if (
              ((search.rolloutTurns !== undefined &&
                engine.state.turnCount >= root.observation.turn + search.rolloutTurns) ||
                (search.maxRolloutDecisions !== undefined && rootDecisions >= search.maxRolloutDecisions)) &&
              window.kind === "main" &&
              engine.state.pendingDecision === undefined &&
              engine.state.combatWindow === undefined
            ) {
              leafValue = evaluateSearchPosition(trainingObservation(engine.state, search.seat));
              control.abort();
              return replayRollout(seat, window);
            }
            rootDecisions++;
            return index === search.seat ? choose(window) : replayRollout(seat, window);
          },
          undefined,
          createReplayMainActionSource({
            seat,
            prefix,
            cursor: () => cursor,
            enabled: options.mcts?.reusePrefixActions !== false,
            onReuse: () => {
              restoration.reusedMainCatalogs++;
            },
            onEnumeration: () => {
              restoration.enumeratedMainCatalogs++;
            },
          }),
        ),
    }));
    const result = await runBotMatch({
      omitHandAffordances: search.omitHandAffordances,
      seed: options.seed,
      seats: [seats[0]!, seats[1]!],
      turnLimit: root.observation.turn + (options.turnLimit ?? 60),
      captureEvents: true,
      ...(options.mcts?.reusePrefixActions === false
        ? {}
        : {
            captureEventFilter: (event: ServerEvent) => event.kind === "actionRejected",
            measureDecisionLatencies: false,
          }),
      signal: AbortSignal.any([control.signal, signal]),
    });
    const replayEnded = performance.now();
    restoration.prefixMs += (rootReachedAt ?? replayEnded) - replayStarted;
    restoration.rolloutMs += replayEnded - (rootReachedAt ?? replayEnded);
    const healthyCutoff =
      leafValue !== undefined &&
      result.reason === "cancelled" &&
      !signal.aborted &&
      !result.timedOut &&
      result.errors.length === 0 &&
      result.rejections.length === 0 &&
      !result.events?.some((event) => event.kind === "actionRejected") &&
      result.seats.every((seat) => seat.inferenceFallbacks.error === 0 && seat.inferenceFallbacks.timeout === 0);
    if (reachedRoot && !mismatch && healthyCutoff) {
      restoration.leafEvaluations++;
      return { reward: leafValue!, valid: true };
    }
    const valid = reachedRoot && !mismatch && validEvolutionGame(result);
    return { reward: result.winnerSeat === search.seat ? 1 : result.winnerSeat === undefined ? 0.5 : 0, valid };
  };
  let teacherSearches = 0;
  let learnerMainWindows = 0;
  let teacherFailures = 0;
  const adviseLearner = async (window: TrainingWindow, signal: AbortSignal): Promise<SearchReport | undefined> => {
    const teacher = options.teacher!;
    const prefix = [...transcript];
    teacherSearches++;
    const search = await searchMcts({
      root: window,
      seat: options.learnerSeat,
      simulations: teacher.simulations,
      signal,
      rolloutChoose: (next) => replayRollout(options.learnerSeat, next),
      simulate: (choose, simulation) =>
        replay(prefix, window, choose, (teacher.seed + prefix.length * 7919 + simulation * 104729) >>> 0, signal, {
          seat: options.learnerSeat,
          rolloutTurns: teacher.rolloutTurns,
          maxRolloutDecisions: teacher.rolloutTurns === undefined ? undefined : 64,
          omitHandAffordances: true,
        }),
    }).catch((error: unknown) => {
      signal.throwIfAborted();
      if (!(error instanceof Error) || error.message !== "No valid MCTS rollouts reached the root") throw error;
      teacherFailures++;
      return undefined;
    });
    return search?.report;
  };
  const seats = options.decks.map((deck) => ({
    deck,
    policyTimeoutMs: 3600000,
    canChooseMainAction: mainActionReady,
    maxMainPhaseActions: Number.POSITIVE_INFINITY,
    policyFactory: (engine: GameEngine, seat: Seat) =>
      createAsyncTrainingPolicy(engine, seat, async (window, signal) => {
        if (transcript.length > 10000) throw new Error("Evolution match decision budget exceeded");
        let action: number;
        if (
          seat === opponentSeat &&
          options.mcts !== undefined &&
          transcript.length >= (options.mcts.startAfterDecisions ?? 0) &&
          searches.length < (options.mcts.maxSearches ?? Number.POSITIVE_INFINITY) &&
          window.kind === "main" &&
          window.actions.length > 1 &&
          engine.state.pendingDecision === undefined &&
          engine.state.combatWindow === undefined
        ) {
          const prefix = [...transcript];
          const leafEvaluationsBefore = restoration.leafEvaluations;
          const search = await searchMcts({
            root: window,
            seat,
            simulations: options.mcts.simulations,
            signal,
            rolloutChoose: (next) => replayRollout(seat, next),
            simulate: (choose, simulation) =>
              replay(
                prefix,
                window,
                choose,
                (options.mcts!.seed + prefix.length * 7919 + simulation * 104729) >>> 0,
                signal,
                {
                  seat: opponentSeat,
                  rolloutTurns: options.mcts!.rolloutTurns,
                  maxRolloutDecisions,
                  omitHandAffordances: options.mcts!.omitRolloutHandAffordances === true,
                },
              ),
          });
          action = search.action;
          if (maxRolloutDecisions !== undefined)
            search.report.leafEvaluations = restoration.leafEvaluations - leafEvaluationsBefore;
          searches.push(search.report);
          options.onSearch?.(search.report);
        } else action = rollout(seat, window);
        const teacher =
          options.teacher !== undefined &&
          options.captureTraces === true &&
          seat === options.learnerSeat &&
          teacherSearches < options.teacher.maxSearches &&
          window.kind === "main" &&
          window.actions.length > 1 &&
          engine.state.pendingDecision === undefined &&
          engine.state.combatWindow === undefined &&
          learnerMainWindows++ % options.teacher.every === 0
            ? await adviseLearner(window, signal)
            : undefined;
        transcript.push({
          seat,
          kind: window.kind,
          information: informationKey(window),
          action: actionKey(window, action),
          actionIndex: action,
          ...(window.kind === "main" &&
          (options.mcts !== undefined || options.teacher !== undefined) &&
          options.mcts?.reusePrefixActions !== false
            ? { mainActions: structuredClone(window.actions) }
            : {}),
        });
        if (options.captureTraces && seat === options.learnerSeat && traces.length < 200) {
          const ranked = rankHeuristic(options.program, window);
          const choice = ranked.find((entry) => entry.index === action)!;
          traces.push({
            turn: window.observation.turn,
            kind: window.kind,
            action: window.actions[action],
            sourceCardId: actionCardId(window, action),
            features: actionFeatures(window, action),
            score: choice.score,
            secondaryScore: choice.secondaryScore,
            resolvedScoreTies: ranked.filter(
              (entry) => entry.score === choice.score && entry.secondaryScore === choice.secondaryScore,
            ).length,
            legalActions: ranked.length,
            topScoreTies: ranked.filter((entry) => entry.score === ranked[0]!.score).length,
            scoreTies: ranked.filter((entry) => entry.score === choice.score).length,
            reasons: choice.contributions.filter((rule) => rule.value !== 0),
            alternatives: ranked
              .filter((entry) => entry.index !== action)
              .slice(0, 3)
              .map((entry) => ({
                action: window.actions[entry.index],
                sourceCardId: actionCardId(window, entry.index),
                features: actionFeatures(window, entry.index),
                score: entry.score,
              })),
            ...(teacher === undefined
              ? {}
              : {
                  teacher: {
                    simulations: teacher.completed,
                    chosenVisits: teacher.root.find((entry) => entry.action === action)!.visits,
                    root: teacher.root.slice(0, 4).map((entry) => ({
                      ...entry,
                      sourceCardId: actionCardId(window, entry.action),
                      features: actionFeatures(window, entry.action),
                    })),
                  },
                }),
          });
        }
        return action;
      }),
  }));
  const result = await runBotMatch({
    seed: options.seed,
    seats: [seats[0]!, seats[1]!],
    turnLimit: options.turnLimit ?? 60,
    captureEvents: true,
    verifyProjections: true,
  });
  return {
    result,
    valid: validEvolutionGame(result) && searches.every((search) => search.completed === search.requested),
    traces,
    searches,
    decisions: transcript.length,
    restoration,
    teacher: options.teacher === undefined ? undefined : { searches: teacherSearches, failures: teacherFailures },
  };
}
