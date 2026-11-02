import { Phase } from "@aegis/shared/schema/enums";
import type { Intent, Seat } from "@aegis/shared";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import type { GameEngine } from "#api/engine/GameEngine";
import { mainActions, type TrainingAction } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";
import { projectMainActionCandidate } from "#api/bot/projectMainActionCandidate";
import { scoreCandidate } from "#api/bot/evaluate";
import type { BotView } from "#api/bot/view";
import type { BotPolicy } from "#api/bot/policy";
import type { BotProfile } from "#api/bot/profiles";
import type { HeuristicProgram } from "#api/bot/evolution/heuristic";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { runLiveSearchInWorker } from "#api/bot/search/runLiveSearchInWorker";
import { prewarmLiveSearchWorkers } from "#api/bot/search/prewarmLiveSearchWorkers";
import type { BotSearchTask } from "#api/bot/search/BotSearchTask";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { PAIRED_ROOT_CANDIDATE_LIMIT } from "#api/bot/search/PAIRED_ROOT_CANDIDATE_LIMIT";
import { LIVE_SEARCH_DECISION_DEADLINE_MS } from "#api/bot/search/LIVE_SEARCH_DECISION_DEADLINE_MS";
import { getSearchFailureFallback } from "#api/bot/search/getSearchFailureFallback";
import { getSearchErrorCause } from "#api/bot/search/getSearchErrorCause";
import { LiveSearchErrorStage } from "#api/bot/search/LiveSearchErrorStage";
import { LiveSearchFallback, type LiveSearchFallbackCounts } from "#api/bot/search/LiveSearchFallback";
import { createCombatRootWindow } from "#api/bot/search/createCombatRootWindow";
import { CombatSearchKind } from "#api/bot/search/CombatSearchKind";
import type { CombatSearchRequest } from "#api/bot/search/CombatSearchRequest";

const MIN_SEARCH_WINDOW_MS = 50;

type Params = {
  engine: GameEngine;
  seat: Seat;
  policy: BotPolicy<Intent | Promise<Intent>>;
  fallbackPolicy: BotPolicy<Intent | Promise<Intent>>;
  profile: BotProfile;
  searchProfile?: BotProfile;
  program: HeuristicProgram;
  seed: number;
  simulations: number;
  candidateLimit?: number;
  maxDurationMs: number;
  decisionDeadlineMs?: number;
  getSeenOpponentCards: () => { main: readonly string[]; eggs: readonly string[] };
};

type ScoredAction = { action: TrainingAction; score: number };

type RootData = { root: TrainingWindow; priors: number[] };

type SearchErrorCounts = Record<string, number>;

function createRootWindow({
  engine,
  seat,
  view,
  baseline,
  profile,
}: {
  engine: GameEngine;
  seat: Seat;
  view: BotView;
  baseline: Intent;
  profile: BotProfile;
}): { root: TrainingWindow; priors: number[] } | undefined {
  const actions = mainActions(engine, seat, { includeSpecialActions: true, digiXrosValidationBudget: 256 });
  const baselineKey = JSON.stringify(baseline);
  const scored: ScoredAction[] = [];
  for (const action of actions) {
    const candidate = projectMainActionCandidate({ view, action });
    if (candidate === undefined || candidate.cost > view.maxAffordable) continue;
    const score = scoreCandidate(view, candidate, profile);
    if (score >= profile.weights.actionThreshold || JSON.stringify(action.intent) === baselineKey) {
      scored.push({ action, score });
    }
  }
  const baselineAction = scored.find((entry) => JSON.stringify(entry.action.intent) === baselineKey);
  if (baselineAction === undefined) return undefined;
  const ordered = [baselineAction, ...scored.filter((entry) => entry !== baselineAction)];
  if (ordered.length < 2) return undefined;
  const root: TrainingWindow = {
    observation: trainingObservation(engine.state, seat),
    kind: "main",
    selected: [],
    actions: ordered.map(({ action }) => action),
  };
  const maxScore = Math.max(...ordered.map(({ score }) => score));
  const rawPriors = ordered.map(({ action, score }) => {
    const standardPrior = Math.exp(Math.max(-20, Math.min(0, (score - maxScore) / 8)));
    return standardPrior * (JSON.stringify(action.intent) === baselineKey ? 1.5 : 1);
  });
  const total = rawPriors.reduce((sum, value) => sum + value, 0);
  return { root, priors: rawPriors.map((value) => value / total) };
}

async function chooseRootAction({
  input,
  rootData,
  fallback,
  seed,
  signal,
  decisionStartedAt,
  fallbacks,
  errors,
}: {
  input: Params;
  rootData: RootData | undefined;
  fallback: Intent;
  seed: number;
  signal?: AbortSignal;
  decisionStartedAt: number;
  fallbacks: LiveSearchFallbackCounts;
  errors: SearchErrorCounts;
}): Promise<Intent> {
  if (rootData === undefined || signal?.aborted) return fallback;
  let snapshot;
  try {
    snapshot = snapshotGameEngine({ engine: input.engine, allowContinuation: true });
  } catch (error) {
    fallbacks[LiveSearchFallback.ERROR.value]++;
    const cause = getSearchErrorCause({ error, stage: LiveSearchErrorStage.SNAPSHOT.value });
    errors[cause] = (errors[cause] ?? 0) + 1;
    return fallback;
  }
  const deadlineEpochMs = Math.min(
    currentEpochMs() + input.maxDurationMs,
    decisionStartedAt + (input.decisionDeadlineMs ?? LIVE_SEARCH_DECISION_DEADLINE_MS),
  );
  if (deadlineEpochMs - currentEpochMs() < MIN_SEARCH_WINDOW_MS) {
    fallbacks[LiveSearchFallback.DEADLINE.value]++;
    return fallback;
  }
  const task: BotSearchTask = {
    snapshot,
    ...(input.engine.hooks.randomKey === undefined ? {} : { randomKey: input.engine.hooks.randomKey }),
    root: rootData.root,
    seat: input.seat,
    program: input.program,
    opponentProgram: SEED_RESIDUAL,
    profile: input.searchProfile ?? input.profile,
    simulations: input.simulations,
    candidateLimit: input.candidateLimit ?? PAIRED_ROOT_CANDIDATE_LIMIT,
    deadlineEpochMs,
    seed,
    rootPriors: rootData.priors,
    seenOpponentCards: input.getSeenOpponentCards(),
  };
  try {
    const search = await runLiveSearchInWorker({ task, signal: signal ?? new AbortController().signal });
    if (signal?.aborted) return fallback;
    return rootData.root.actions[search.action]?.intent ?? fallback;
  } catch (error) {
    if (signal?.aborted) return fallback;
    const reason = getSearchFailureFallback({ error, deadlineEpochMs });
    fallbacks[reason]++;
    if (reason === LiveSearchFallback.ERROR.value) {
      const cause = getSearchErrorCause({ error, stage: LiveSearchErrorStage.SEARCH.value });
      errors[cause] = (errors[cause] ?? 0) + 1;
    }
    return fallback;
  }
}

async function chooseCombatAnswers({
  input,
  request,
  signal,
}: {
  input: Params;
  request: CombatSearchRequest;
  signal?: AbortSignal;
}): Promise<[Intent, Intent]> {
  if (request.kind === CombatSearchKind.BLOCK.value) {
    return [
      await input.policy.chooseBlockResponse(request.view, request.context, signal),
      await input.fallbackPolicy.chooseBlockResponse(request.view, request.context, signal),
    ];
  }
  return [
    await input.policy.chooseCounterResponse(request.view, request.context, signal),
    await input.fallbackPolicy.chooseCounterResponse(request.view, request.context, signal),
  ];
}

export function createLiveSearchPolicy(input: Params): BotPolicy<Intent | Promise<Intent>> {
  let searchIndex = 0;
  const fallbacks: LiveSearchFallbackCounts = {
    [LiveSearchFallback.DEADLINE.value]: 0,
    [LiveSearchFallback.CAPACITY.value]: 0,
    [LiveSearchFallback.ERROR.value]: 0,
  };
  const errors: SearchErrorCounts = {};
  input.engine.snapshotContinuation.enable();
  void prewarmLiveSearchWorkers().catch(() => undefined);
  const searchCombat = async ({
    request,
    decisionStartedAt,
    signal,
  }: {
    request: CombatSearchRequest;
    decisionStartedAt: number;
    signal?: AbortSignal;
  }): Promise<Intent> => {
    const [baseline, fallback] = await chooseCombatAnswers({ input, request, signal });
    const window = input.engine.state.combatWindow;
    if (signal?.aborted || window?.kind !== request.kind || window.seat !== input.seat) {
      return fallback;
    }
    return chooseRootAction({
      input,
      rootData: createCombatRootWindow({ engine: input.engine, seat: input.seat, baseline, request }),
      fallback,
      seed: (input.seed + searchIndex++ * 104729) >>> 0,
      signal,
      decisionStartedAt,
      fallbacks,
      errors,
    });
  };
  return {
    ...input.policy,
    name: `live-search:${input.policy.name}`,
    observeEvent(event) {
      input.policy.observeEvent?.(event);
    },
    onTurnStart() {
      input.policy.onTurnStart();
      void prewarmLiveSearchWorkers().catch(() => undefined);
    },
    getSeenOpponentCards: () => input.getSeenOpponentCards(),
    searchFallbacks: () => ({ ...fallbacks }),
    searchErrors: () => ({ ...errors }),
    chooseBlockResponse(view, context, signal) {
      const request = { kind: CombatSearchKind.BLOCK.value, view, context } as const;
      return searchCombat({ request, decisionStartedAt: currentEpochMs(), signal });
    },
    chooseCounterResponse(view, context, signal) {
      const request = { kind: CombatSearchKind.COUNTER.value, view, context } as const;
      return searchCombat({ request, decisionStartedAt: currentEpochMs(), signal });
    },
    async chooseMainAction(view, signal) {
      const decisionStartedAt = currentEpochMs();
      const baseline = await input.policy.chooseMainAction(view, signal);
      const fallback = await input.fallbackPolicy.chooseMainAction(view, signal);
      if (
        signal?.aborted ||
        input.engine.state.phase !== Phase.Main ||
        input.engine.state.turnSeat !== input.seat ||
        input.engine.state.pendingDecision !== undefined ||
        input.engine.state.combatWindow !== undefined
      ) {
        return fallback;
      }
      const rootData = createRootWindow({
        engine: input.engine,
        seat: input.seat,
        view,
        baseline,
        profile: input.profile,
      });
      return chooseRootAction({
        input,
        rootData,
        fallback,
        seed: (input.seed + searchIndex++ * 104729) >>> 0,
        signal,
        decisionStartedAt,
        fallbacks,
        errors,
      });
    },
  };
}
