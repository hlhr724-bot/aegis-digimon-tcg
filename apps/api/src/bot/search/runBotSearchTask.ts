import { informationKey } from "#api/bot/evolution/mcts";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";
import { createEvaluationPolicy } from "#api/bot/policy";
import { mainActionReady } from "#api/bot/training/actions";
import type { BotSearchResult, BotSearchTask } from "#api/bot/search/BotSearchTask";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { isSearchLeaf } from "#api/bot/search/isSearchLeaf";
import { searchPairedRoot } from "#api/bot/search/searchPairedRoot";
import type { SearchRollout } from "#api/bot/search/SearchRollout";

type Params = {
  task: BotSearchTask;
  signal: AbortSignal;
  onRollout?: (rollout: SearchRollout) => void;
};

export async function runBotSearchTask({ task, signal, onRollout }: Params): Promise<BotSearchResult> {
  const remainingMs = task.deadlineEpochMs - currentEpochMs();
  if (!(remainingMs > 0)) throw new Error("Bot search deadline passed before the search started");
  const simulationSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.ceil(remainingMs))]);
  const expectedInformation = informationKey(task.root);
  return searchPairedRoot({
    priors: task.rootPriors,
    candidateLimit: task.candidateLimit,
    simulations: task.simulations,
    maxDurationMs: remainingMs,
    signal,
    simulate: async ({ action, sample }) => {
      const sampleSeed = (task.seed + sample * 104729) >>> 0;
      try {
        const result = await runReplayContinuation({
          engineSnapshot: task.snapshot,
          ...(task.randomKey === undefined ? {} : { randomKey: task.randomKey }),
          seat: task.seat,
          expectedInformation,
          sampleSeed,
          program: task.program,
          opponentProgram: task.opponentProgram,
          rolloutPolicy: createEvaluationPolicy({ profile: task.profile, seed: sampleSeed + task.seat * 7919 }),
          rootWindow: task.root,
          choose: () => action,
          rolloutTurns: 1,
          maxRolloutDecisions: 128,
          maxDurationMs: Math.max(1, task.deadlineEpochMs - currentEpochMs()),
          signal: simulationSignal,
          seenOpponentCards: task.seenOpponentCards,
          profile: task.profile,
          opponent: {
            policyFactory: (_engine, seat) =>
              createEvaluationPolicy({ profile: task.profile, seed: sampleSeed + seat * 7919 }),
            canChooseMainAction: mainActionReady,
          },
        });
        const valid = isSearchLeaf(result);
        onRollout?.({
          action,
          sample,
          reward: result.reward,
          valid,
          reason: result.reason,
          state: result.state,
          phasesMs: result.phasesMs,
        });
        return { reward: result.reward, valid, reason: result.reason };
      } catch (error) {
        if (signal.aborted || !simulationSignal.aborted) throw error;
        return { reward: 0, valid: false, reason: "aborted" };
      }
    },
  });
}
