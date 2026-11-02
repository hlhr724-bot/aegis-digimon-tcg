import { performance } from "node:perf_hooks";
import type { SearchReport } from "#api/bot/evolution/mcts";

type SampleResult = { reward: number; valid: boolean; reason?: string };

type Params = {
  priors: readonly number[];
  candidateLimit: number;
  simulations: number;
  maxDurationMs: number;
  signal?: AbortSignal;
  simulate: (params: { action: number; sample: number }) => Promise<SampleResult>;
};

function rankCandidates({ priors, limit }: { priors: readonly number[]; limit: number }): number[] {
  const ordered = priors
    .map((prior, action) => ({ prior, action }))
    .sort((left, right) => right.prior - left.prior || left.action - right.action)
    .map(({ action }) => action);
  const chosen = ordered.slice(0, Math.max(1, limit));
  if (!chosen.includes(0)) chosen[chosen.length - 1] = 0;
  return [0, ...chosen.filter((action) => action !== 0)];
}

function isScorable({ reward, valid }: SampleResult): boolean {
  return valid && Number.isFinite(reward) && reward >= 0 && reward <= 1;
}

function bestCandidate({ candidates, totals }: { candidates: readonly number[]; totals: Map<number, number> }) {
  return candidates.reduce((best, action) => (totals.get(action)! > totals.get(best)! ? action : best));
}

export async function searchPairedRoot({
  priors,
  candidateLimit,
  simulations,
  maxDurationMs,
  signal,
  simulate,
}: Params): Promise<{ action: number; report: SearchReport }> {
  if (!Number.isSafeInteger(simulations) || simulations < 1 || simulations > 10000)
    throw new Error("Paired root search simulations must be an integer from 1 to 10000");
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit < 1)
    throw new Error("Paired root search needs a positive candidate limit");
  if (priors.length === 0) throw new Error("Paired root search needs at least one root action");
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0)
    throw new Error("Paired root search time budget must be positive and finite");
  const started = performance.now();
  const timeExhausted = () => performance.now() - started >= maxDurationMs;
  let candidates = rankCandidates({ priors, limit: Math.min(candidateLimit, simulations) });
  const totals = new Map(candidates.map((action) => [action, 0]));
  const counts = new Map(candidates.map((action) => [action, 0]));
  const firstSample = new Map<number, number>();
  let samples = 0;
  let sample = 0;
  let attempted = 0;
  let invalid = 0;
  const invalidReasons = new Set<string>();
  let stopped = false;
  while (!stopped && candidates.length > 1 && attempted + candidates.length <= simulations) {
    const rounds = Math.max(1, Math.ceil(Math.log2(candidates.length)));
    const perRound = Math.max(1, Math.floor((simulations - attempted) / (candidates.length * rounds)));
    for (let round = 0; round < perRound && attempted + candidates.length <= simulations; round++) {
      const results = new Map<number, number>();
      for (const action of candidates) {
        signal?.throwIfAborted();
        if (attempted > 0 && timeExhausted()) {
          stopped = true;
          break;
        }
        attempted++;
        const result = await simulate({ action, sample });
        if (!isScorable(result)) {
          invalid++;
          invalidReasons.add(result.valid ? "unscorable" : (result.reason ?? "invalid"));
          break;
        }
        results.set(action, result.reward);
        if (sample === 0) firstSample.set(action, result.reward);
      }
      sample++;
      if (stopped) break;
      if (results.size !== candidates.length) continue;
      for (const [action, reward] of results) {
        totals.set(action, totals.get(action)! + reward);
        counts.set(action, counts.get(action)! + 1);
      }
      samples++;
    }
    if (stopped || samples === 0 || candidates.length === 2) continue;
    candidates = [...candidates]
      .sort(
        (left, right) => totals.get(right)! - totals.get(left)! || candidates.indexOf(left) - candidates.indexOf(right),
      )
      .slice(0, Math.ceil(candidates.length / 2));
  }
  signal?.throwIfAborted();
  const scored = samples > 0 ? totals : firstSample;
  const scoredCandidates = candidates.filter((action) => scored.has(action));
  if (candidates.length > 1 && scoredCandidates.length === 0)
    throw new Error(`No valid paired samples reached the root: ${[...invalidReasons].sort().join(", ")}`);
  const action =
    candidates.length === 1 ? candidates[0]! : bestCandidate({ candidates: scoredCandidates, totals: scored });
  const visits = (index: number) => (samples > 0 ? (counts.get(index) ?? 0) : firstSample.has(index) ? 1 : 0);
  const root = priors
    .map((_, index) => ({
      action: index,
      visits: visits(index),
      meanReward: visits(index) === 0 ? 0 : scored.get(index)! / visits(index),
    }))
    .sort((left, right) =>
      left.action === action
        ? -1
        : right.action === action
          ? 1
          : right.visits - left.visits || left.action - right.action,
    );
  return {
    action,
    report: {
      requested: simulations,
      attempted,
      completed: attempted - invalid,
      invalid,
      nodes: 1,
      root,
      timeBudget: { requestedMs: maxDurationMs, elapsedMs: performance.now() - started, exhausted: timeExhausted() },
    },
  };
}
