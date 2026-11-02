import { hasUnsupportedReplayDeterminization } from "#api/bot/evolution/hasUnsupportedReplayDeterminization";
import { Phase } from "@aegis/shared/schema/enums";
import { createLibraryKnowledgeTracker } from "#api/bot/evolution/createLibraryKnowledgeTracker";
import { createSeenOpponentCardsTracker } from "#api/bot/evolution/createSeenOpponentCardsTracker";
import { determinizeBotRoot } from "#api/bot/evolution/determinizeBotRoot";
import { determinizeFromArchetypes } from "#api/bot/evolution/determinizeFromArchetypes";
import type { GameEngine } from "#api/engine/GameEngine";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";
import type { BotPolicy } from "#api/bot/policy";
import { performance } from "node:perf_hooks";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";
import { BotPlayer } from "#api/bot/BotPlayer";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { determinize } from "#api/bot/evolution/determinize";
import { getReplaySearchWindow } from "#api/bot/evolution/getReplaySearchWindow";
import { informationKey } from "#api/bot/evolution/mcts";
import { chooseHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { mainActionReady } from "#api/bot/training/actions";
import { createAsyncTrainingPolicy, type TrainingWindow } from "#api/bot/training/policy";
import { teacherActionIndex } from "#api/bot/training/teacher";
import { evaluateSearchPosition } from "#api/bot/evolution/evaluateSearchPosition";
import { trainingObservation } from "#api/bot/training/observation";
import type { SeenOpponentCards } from "#api/bot/evolution/SeenOpponentCards";
import type { BotProfile } from "#api/bot/profiles";

type ContinuationOpponent = {
  policyFactory: (engine: GameEngine, seat: Seat) => BotPolicy<Intent | Promise<Intent>>;
  canChooseMainAction?: (engine: GameEngine) => boolean;
  maxMainPhaseActions?: number;
};

type Params = {
  record?: ReplayRecord;
  inputIndex?: number;
  engineSnapshot?: GameEngineSnapshot;
  forceArchetypeDeterminization?: boolean;
  randomKey?: string;
  seat: Seat;
  expectedInformation: string;
  sampleSeed: number;
  program: HeuristicProgram;
  opponentProgram?: HeuristicProgram;
  rootWindow?: TrainingWindow;
  rolloutPolicy?: BotPolicy;
  choose: (window: TrainingWindow) => number;
  chooseAfterRoot?: (window: TrainingWindow) => number;
  opponent?: ContinuationOpponent;
  maxMainPhaseActions?: number;
  signal?: AbortSignal;
  maxDurationMs?: number;
  turnLimit?: number;
  rolloutTurns?: number;
  maxRolloutDecisions?: number;
  seenOpponentCards?: SeenOpponentCards;
  profile?: BotProfile;
};

function optionalSeatLimits(canChooseMainAction: (() => boolean) | undefined, maxMainPhaseActions: number | undefined) {
  return {
    ...(canChooseMainAction === undefined ? {} : { canChooseMainAction }),
    ...(maxMainPhaseActions === undefined ? {} : { maxMainPhaseActions }),
  };
}

function mergeSeenOpponentCards({
  provided,
  observed,
}: {
  provided: SeenOpponentCards | undefined;
  observed: SeenOpponentCards;
}): SeenOpponentCards {
  return {
    main: [...new Set([...(provided?.main ?? []), ...observed.main])],
    eggs: [...new Set([...(provided?.eggs ?? []), ...observed.eggs])],
  };
}

function matchesRootWindow(window: TrainingWindow, root: TrainingWindow): boolean {
  const { history: _windowHistory, ...windowObservation } = window.observation;
  const { history: _rootHistory, ...rootObservation } = root.observation;
  return (
    window.kind === root.kind &&
    JSON.stringify(windowObservation) === JSON.stringify(rootObservation) &&
    JSON.stringify(window.selected) === JSON.stringify(root.selected) &&
    JSON.stringify(window.request === undefined ? undefined : { ...window.request, decisionId: undefined }) ===
      JSON.stringify(root.request === undefined ? undefined : { ...root.request, decisionId: undefined }) &&
    JSON.stringify(window.combat) === JSON.stringify(root.combat)
  );
}

export async function runReplayContinuation(input: Params) {
  if (
    input.engineSnapshot === undefined &&
    (input.record === undefined ||
      !Number.isSafeInteger(input.inputIndex) ||
      input.inputIndex! < 0 ||
      input.inputIndex! >= input.record.inputs.length)
  ) {
    throw new Error("Invalid replay root index");
  }
  if (
    input.rolloutTurns !== undefined &&
    (!Number.isSafeInteger(input.rolloutTurns) || input.rolloutTurns < 1 || input.rolloutTurns > 200)
  ) {
    throw new Error("Invalid snapshot rollout turn count");
  }
  if (
    input.maxRolloutDecisions !== undefined &&
    (!Number.isSafeInteger(input.maxRolloutDecisions) ||
      input.maxRolloutDecisions < 1 ||
      input.maxRolloutDecisions > 10000)
  ) {
    throw new Error("Invalid snapshot rollout decision count");
  }
  const started = performance.now();
  const botRoot = input.record?.seats.every((seat) => seat.bot === true) ?? false;
  const library = createLibraryKnowledgeTracker();
  const seenOpponentCards = createSeenOpponentCardsTracker({ observer: input.seat });
  let unsupportedKnowledge = false;
  let knowledgeReason = "";
  const bots: BotPlayer[] = [];
  const failures: string[] = [];
  let progress = 0;
  let terminalReward: number | undefined;
  let reason = "unfinished";
  let closed = false;
  let engine: GameEngine;
  let state: GameEngine["state"];
  let redeliverOpenPrompts = () => {};
  const hooks = {
    seed: input.sampleSeed,
    ...(input.engineSnapshot === undefined ? {} : { omitHandAffordances: true }),
    ...(input.randomKey === undefined ? {} : { randomKey: input.randomKey }),
    requestDecision: (seat: Seat, request: import("@aegis/shared").DecisionRequest) =>
      bots[seat]?.onDecisionRequested(request),
    onActionSettled: (seat: Seat, type: Intent["type"]) => bots[seat]?.onActionSettled(type),
    emit: (event: import("@aegis/shared").ServerEvent) => {
      progress++;
      if (event.kind === "gameOver") {
        reason = event.reason;
        terminalReward = event.result.outcome === "draw" ? 0.5 : Number(event.result.winnerSeat === input.seat);
      }
      if (event.kind === "actionRejected") failures.push("actionRejected");
      for (const bot of bots) bot.onEvent(event);
    },
  };
  const run =
    input.engineSnapshot === undefined
      ? await runReplay(input.record!, {
          untilInput: input.inputIndex,
          stopOnDivergence: true,
          onBatch: (batchState, events) => {
            for (const event of events) seenOpponentCards.observeEvent(event);
            if (botRoot) {
              library.observeBatch(batchState, events);
              return;
            }
            if (events.some((event) => event.kind === "matchStarted")) unsupportedKnowledge = false;
            if (events.some((event) => hasUnsupportedReplayDeterminization(event))) {
              unsupportedKnowledge = true;
              knowledgeReason = JSON.stringify(events.filter(hasUnsupportedReplayDeterminization));
            }
          },
          onDecision: (request) => {
            if (botRoot) {
              library.observeDecision(request);
              return;
            }
            if (request.seat === input.seat && (request.options?.visibleCards?.length ?? 0) > 0) {
              unsupportedKnowledge = true;
              knowledgeReason = "private visible cards";
            }
          },
        })
      : undefined;
  if (run !== undefined && (run.divergences.length || run.applied !== input.inputIndex)) {
    throw new Error("Replay prefix diverged");
  }
  if (run !== undefined) {
    engine = run.engine;
    state = run.state;
  } else {
    const restored = restoreGameEngine({ snapshot: input.engineSnapshot!, hooks });
    restored.engine.runtimeObjects.disableSnapshots();
    engine = restored.engine;
    state = restored.engine.state;
    void restored.completion.catch((error) => failures.push(error instanceof Error ? error.message : String(error)));
    await restored.ready;
    redeliverOpenPrompts = restored.redeliverOpenPrompts;
  }
  const restoredAt = performance.now();
  if (unsupportedKnowledge) {
    throw new Error(`Replay prefix has unsupported revealed or ordered hidden knowledge: ${knowledgeReason}`);
  }
  if (run !== undefined) {
    const libraryKnowledge = library.getKnowledge(state);
    if (libraryKnowledge !== undefined) {
      throw new Error(`Replay prefix has publicly known library order: ${libraryKnowledge}`);
    }
  }
  const root = input.rootWindow ?? getReplaySearchWindow({ engine, seat: input.seat });
  if (
    informationKey(root) !== input.expectedInformation ||
    (input.rootWindow !== undefined &&
      JSON.stringify(trainingObservation(state, input.seat)) !== JSON.stringify(root.observation))
  ) {
    throw new Error("Replay root observation or offered actions changed");
  }
  if (input.engineSnapshot !== undefined || input.forceArchetypeDeterminization === true) {
    await determinizeFromArchetypes({
      engine,
      observer: input.seat,
      seed: input.sampleSeed,
      seenCards: mergeSeenOpponentCards({ provided: input.seenOpponentCards, observed: seenOpponentCards.snapshot() }),
    });
  } else if (botRoot) {
    await determinizeBotRoot(engine, input.sampleSeed);
  } else {
    await determinize(engine, input.seat, input.sampleSeed);
  }
  const visibleRootMatches =
    input.rootWindow === undefined
      ? informationKey(getReplaySearchWindow({ engine, seat: input.seat })) === input.expectedInformation
      : JSON.stringify(trainingObservation(state, input.seat)) === JSON.stringify(root.observation);
  if (!visibleRootMatches) {
    throw new Error("Hidden sampling changed the visible root");
  }
  const determinizedAt = performance.now();
  let rootChosen = false;
  let rolloutDecisions = 0;
  let leafMs = 0;
  function getRootActions() {
    if (rootChosen || root.kind !== "main") {
      return undefined;
    }
    return [...root.actions];
  }
  let rootDeclaration: Intent | undefined;
  function chooseRootDeclarationStep(window: TrainingWindow): number | undefined {
    if (rootDeclaration === undefined || window.kind !== "selectCards" || window.request !== undefined) {
      rootDeclaration = undefined;
      return undefined;
    }
    return teacherActionIndex(window, rootDeclaration, rootDeclaration);
  }
  function chooseControlled(window: TrainingWindow): number {
    if (!rootChosen && matchesRootWindow(window, root)) {
      rootChosen = true;
      const index = input.choose(root);
      rootDeclaration = root.actions[index]?.intent;
      return index;
    }
    const declarationStep = chooseRootDeclarationStep(window);
    if (declarationStep !== undefined) return declarationStep;
    if (input.chooseAfterRoot !== undefined) {
      rolloutDecisions++;
      return input.chooseAfterRoot(window);
    }
    if (input.rolloutPolicy !== undefined) {
      if (window.teacher?.action === undefined || window.teacher.action === null) {
        throw new Error("Standard rollout policy selected an action outside the legal rollout window");
      }
      rolloutDecisions++;
      return window.teacher.action;
    }
    if (window.kind === "main") {
      rolloutDecisions++;
      return input.choose(window);
    }
    rolloutDecisions++;
    return chooseHeuristic(input.program, window, input.sampleSeed + input.seat * 7919);
  }
  function createPolicy(seat: Seat): BotPolicy<Intent | Promise<Intent>> {
    if (seat !== input.seat && input.opponent !== undefined) {
      return input.opponent.policyFactory(engine, seat);
    }
    return createAsyncTrainingPolicy(
      engine,
      seat,
      async (window) => {
        input.signal?.throwIfAborted();
        if (seat === input.seat) {
          return chooseControlled(window);
        }
        if (rootChosen) rolloutDecisions++;
        return chooseHeuristic(input.opponentProgram ?? input.program, window, input.sampleSeed + seat * 7919);
      },
      seat === input.seat ? input.rolloutPolicy : undefined,
      seat === input.seat ? getRootActions : undefined,
    );
  }
  function getMainActionGate(seat: Seat): (() => boolean) | undefined {
    if (seat === input.seat || input.opponent === undefined) {
      return () => mainActionReady(engine);
    }
    const gate = input.opponent.canChooseMainAction;
    return gate === undefined ? undefined : () => gate(engine);
  }
  function getMainPhaseActionLimit(seat: Seat): number | undefined {
    if (seat === input.seat) {
      return input.maxMainPhaseActions;
    }
    return input.opponent?.maxMainPhaseActions;
  }
  const policies = ([0, 1] as const).map(createPolicy);
  for (const seat of [0, 1] as const) {
    bots.push(
      new BotPlayer(
        seat,
        state,
        (intent: Intent) => {
          if (closed || input.signal?.aborted) {
            return;
          }
          try {
            const result = engine.applyIntent(seat, intent);
            progress++;
            if (!result.ok) {
              failures.push(result.reason);
            }
            return result;
          } catch (error) {
            failures.push(String(error));
            return { ok: false, reason: "not-implemented" };
          }
        },
        {
          policy: policies[seat],
          seed: input.sampleSeed + seat * 7919,
          policyTimeoutMs: 60000,
          thinkDelay: () => new Promise<void>((resolve) => setImmediate(resolve)),
          ...optionalSeatLimits(getMainActionGate(seat), getMainPhaseActionLimit(seat)),
        },
      ),
    );
  }
  if (run !== undefined) run.activate(hooks);
  const rootTurn = state.turnCount;
  let idle = 0;
  let previous = progress;
  try {
    for (const bot of bots) bot.resumeAfterRollback();
    redeliverOpenPrompts();
    while (!state.gameOver && failures.length === 0) {
      input.signal?.throwIfAborted();
      if (
        performance.now() - started > (input.maxDurationMs ?? 60000) ||
        state.turnCount > rootTurn + (input.turnLimit ?? 60)
      ) {
        reason = "continuationLimit";
        break;
      }
      if (
        input.rolloutTurns !== undefined &&
        state.turnCount >= rootTurn + input.rolloutTurns * 2 &&
        state.turnSeat === input.seat &&
        state.phase === Phase.Main &&
        state.pendingDecision === undefined &&
        state.combatWindow === undefined &&
        engine.mainPhase.isOpen
      ) {
        const leafStartedAt = performance.now();
        terminalReward = evaluateSearchPosition(trainingObservation(state, input.seat), input.profile);
        leafMs = performance.now() - leafStartedAt;
        reason = "rolloutCutoff";
        state.gameOver = true;
        engine.mainPhase.abort();
        break;
      }
      if (
        input.maxRolloutDecisions !== undefined &&
        rolloutDecisions >= input.maxRolloutDecisions &&
        state.turnSeat === input.seat &&
        state.turnCount > rootTurn &&
        state.phase === Phase.Main &&
        state.pendingDecision === undefined &&
        state.combatWindow === undefined &&
        engine.mainPhase.isOpen
      ) {
        const leafStartedAt = performance.now();
        terminalReward = evaluateSearchPosition(trainingObservation(state, input.seat), input.profile);
        leafMs = performance.now() - leafStartedAt;
        reason = "rolloutCutoff";
        state.gameOver = true;
        engine.mainPhase.abort();
        break;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      idle = progress === previous ? idle + 1 : 0;
      previous = progress;
      if (idle > 5000 && bots.every((bot) => bot.diagnosticState.pendingPolicyDecisions === 0)) {
        reason = "stalled";
        break;
      }
    }
  } finally {
    closed = true;
    for (const bot of bots) {
      bot.dispose();
    }
  }
  const valid =
    rootChosen &&
    terminalReward !== undefined &&
    failures.length === 0 &&
    bots.every((bot) => bot.inferenceFallbacks.error === 0 && bot.inferenceFallbacks.timeout === 0);
  const finishedAt = performance.now();
  return {
    valid,
    reward: terminalReward ?? 0,
    reason,
    turn: state.turnCount,
    failures,
    ms: finishedAt - started,
    state,
    phasesMs: {
      restore: restoredAt - started,
      determinize: determinizedAt - restoredAt,
      continuation: finishedAt - determinizedAt - leafMs,
      leaf: leafMs,
    },
  };
}
