import { expect, it } from "vitest";
import { LiveSearchWorkerPool } from "#api/bot/search/LiveSearchWorkerPool";
import type { BotSearchTask } from "#api/bot/search/BotSearchTask";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { LiveSearchFallback } from "#api/bot/search/LiveSearchFallback";
import { LiveSearchFailure } from "#api/bot/search/LiveSearchFailure";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import type { TrainingWindow } from "#api/bot/training/policy";
import { DEFAULT_BOT_PROFILE } from "#api/bot/profiles";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";

function createTask({ deadlineEpochMs }: { deadlineEpochMs: number }): BotSearchTask {
  return {
    snapshot: {} as GameEngineSnapshot,
    root: {} as TrainingWindow,
    seat: 0,
    program: SEED_RESIDUAL,
    opponentProgram: SEED_RESIDUAL,
    profile: DEFAULT_BOT_PROFILE,
    simulations: 0,
    candidateLimit: 3,
    deadlineEpochMs,
    seed: 1,
    rootPriors: [],
    seenOpponentCards: { main: [], eggs: [] },
  };
}

async function failureOf(search: Promise<unknown>): Promise<LiveSearchFailure> {
  const error = await search.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(LiveSearchFailure);
  return error as LiveSearchFailure;
}

it("runs paired search validation in an isolated search worker", async () => {
  const pool = new LiveSearchWorkerPool(1);
  await pool.prewarm();
  const failure = await failureOf(
    pool.run({ task: createTask({ deadlineEpochMs: currentEpochMs() + 1_000 }), signal: new AbortController().signal }),
  );
  expect(failure.fallback).toBe(LiveSearchFallback.ERROR.value);
  expect(failure.message).toContain("Paired root search simulations must be an integer");
});

it("reports a search whose deadline has passed as a deadline fallback", async () => {
  const pool = new LiveSearchWorkerPool(1);
  await pool.prewarm();
  const late = await failureOf(
    pool.run({ task: createTask({ deadlineEpochMs: currentEpochMs() - 1_000 }), signal: new AbortController().signal }),
  );
  expect(late.fallback).toBe(LiveSearchFallback.DEADLINE.value);
});

it("counts started and failed searches with their fallbacks in its usage", async () => {
  const pool = new LiveSearchWorkerPool(1);
  await pool.prewarm();
  await failureOf(
    pool.run({ task: createTask({ deadlineEpochMs: currentEpochMs() + 1_000 }), signal: new AbortController().signal }),
  );
  await failureOf(
    pool.run({ task: createTask({ deadlineEpochMs: currentEpochMs() - 1_000 }), signal: new AbortController().signal }),
  );
  const usage = pool.readUsage();
  expect(usage.started).toBe(1);
  expect(usage.completed).toBe(0);
  expect(usage.fallbacks).toEqual({
    [LiveSearchFallback.DEADLINE.value]: 1,
    [LiveSearchFallback.CAPACITY.value]: 0,
    [LiveSearchFallback.ERROR.value]: 1,
  });
  expect(usage.activeMs).toBeGreaterThan(0);
});

it("refuses a search without a warm worker as a capacity fallback", async () => {
  const pool = new LiveSearchWorkerPool(1);
  const refused = await failureOf(
    pool.run({ task: createTask({ deadlineEpochMs: currentEpochMs() + 1_000 }), signal: new AbortController().signal }),
  );
  expect(refused.fallback).toBe(LiveSearchFallback.CAPACITY.value);
  await pool.prewarm();
});
