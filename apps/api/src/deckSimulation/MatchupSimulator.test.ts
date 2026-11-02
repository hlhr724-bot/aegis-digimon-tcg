import { afterEach, describe, expect, it, vi } from "vitest";
import { RED_DECK } from "#api/engine/testDecks";
import { MatchupSimulator } from "#api/deckSimulation/MatchupSimulator";
import type { MatchupRequest } from "#api/deckSimulation/MatchupRequest";
import type { MatchupWorkerHandle } from "#api/deckSimulation/MatchupWorkerHandle";
import type { MatchupWorkerMessage, MatchupWorkerRequest } from "#api/deckSimulation/MatchupWorkerMessage";

const request: MatchupRequest = {
  deck: RED_DECK,
  opponents: [
    { name: "Mirror", deck: RED_DECK },
    { name: "Community", deck: RED_DECK, communityDeckId: "11111111-1111-4111-8111-111111111111" },
  ],
  gamesPerOpponent: 4,
};

function createFakeWorker() {
  const posted: MatchupWorkerRequest[] = [];
  let listener: (message: MatchupWorkerMessage) => void = () => {};
  let exitListener: () => void = () => {};
  let terminated = 0;
  const handle: MatchupWorkerHandle = {
    postMessage: (message) => posted.push(message),
    onMessage: (next) => {
      listener = next;
    },
    onExit: (next) => {
      exitListener = next;
    },
    terminate: () => {
      terminated++;
    },
  };
  return {
    handle,
    posted,
    emit: (message: MatchupWorkerMessage) => listener(message),
    exit: () => exitListener(),
    terminations: () => terminated,
  };
}

function lastJobId(posted: MatchupWorkerRequest[]): string {
  const run = posted.findLast((message) => message.type === "run");
  if (run?.type !== "run") throw new Error("No job was sent to the worker");
  return run.task.jobId;
}

describe("MatchupSimulator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a job in the worker and reports the score, interval and sample games", () => {
    const worker = createFakeWorker();
    const simulator = new MatchupSimulator({ spawnWorker: () => worker.handle, isHostBusy: () => false });
    const job = simulator.start({ accountId: "a", request });
    expect(job.status).toBe("queued");
    expect(worker.posted).toEqual([]);
    worker.emit({ type: "ready" });
    const jobId = lastJobId(worker.posted);
    expect(simulator.get({ accountId: "a", jobId })?.status).toBe("running");
    const replayFile = new Uint8Array([31, 139, 8]);
    worker.emit({
      type: "game",
      jobId,
      index: 0,
      opponentIndex: 0,
      playerFirst: true,
      outcome: { result: "win", reason: "security", turns: 9 },
      replayFile,
    });
    worker.emit({
      type: "game",
      jobId,
      index: 1,
      opponentIndex: 0,
      playerFirst: false,
      outcome: { result: "loss", reason: "security", turns: 11 },
    });
    worker.emit({
      type: "game",
      jobId,
      index: 4,
      opponentIndex: 1,
      playerFirst: true,
      outcome: { result: "draw", reason: "turnLimit", turns: 60 },
    });
    worker.emit({
      type: "game",
      jobId,
      index: 5,
      opponentIndex: 1,
      playerFirst: false,
      outcome: { result: undefined, reason: "stalled", turns: 4 },
    });
    worker.emit({ type: "finished", jobId, end: "completed" });
    const finished = simulator.get({ accountId: "a", jobId })!;
    expect(finished).toMatchObject({
      status: "completed",
      completedGames: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      invalidGames: 1,
      score: 0.5,
      samples: [{ index: 0, opponentIndex: 0, wentFirst: true, result: "win", reason: "security", turns: 9 }],
    });
    expect(finished.requestedGames).toBe(8);
    expect(finished.opponents).toMatchObject([
      { name: "Mirror", requestedGames: 4, completedGames: 2, wins: 1, losses: 1, score: 0.5 },
      {
        name: "Community",
        communityDeckId: "11111111-1111-4111-8111-111111111111",
        completedGames: 1,
        draws: 1,
        invalidGames: 1,
        score: 0.5,
      },
    ]);
    expect(finished.interval![0]).toBeLessThan(0.5);
    expect(finished.interval![1]).toBeGreaterThan(0.5);
    expect(simulator.replay({ accountId: "a", jobId, index: 0 })).toBe(replayFile);
    expect(simulator.replay({ accountId: "a", jobId, index: 1 })).toBeUndefined();
  });

  it("cancels a queued job at once and asks the worker to stop a running one", () => {
    const worker = createFakeWorker();
    const simulator = new MatchupSimulator({ spawnWorker: () => worker.handle, isHostBusy: () => false });
    const running = simulator.start({ accountId: "a", request });
    const queued = simulator.start({ accountId: "b", request });
    worker.emit({ type: "ready" });
    expect(simulator.cancel({ accountId: "b", jobId: queued.id })?.status).toBe("cancelled");
    expect(simulator.cancel({ accountId: "b", jobId: running.id })).toBeUndefined();
    simulator.cancel({ accountId: "a", jobId: running.id });
    expect(worker.posted.at(-1)).toEqual({ type: "cancel", jobId: running.id });
    worker.emit({ type: "finished", jobId: running.id, end: "cancelled" });
    expect(simulator.get({ accountId: "a", jobId: running.id })?.status).toBe("cancelled");
    expect(worker.posted.filter((message) => message.type === "run")).toHaveLength(1);
    simulator.close();
  });

  it("hides jobs and replays from other accounts", () => {
    const worker = createFakeWorker();
    const simulator = new MatchupSimulator({ spawnWorker: () => worker.handle, isHostBusy: () => false });
    const job = simulator.start({ accountId: "a", request });
    expect(simulator.get({ accountId: "b", jobId: job.id })).toBeUndefined();
    expect(simulator.replay({ accountId: "b", jobId: job.id, index: 0 })).toBeUndefined();
  });

  it("allows one unfinished job per account and a bounded queue", () => {
    const simulator = new MatchupSimulator({
      spawnWorker: () => createFakeWorker().handle,
      isHostBusy: () => false,
      limits: { queuedJobs: 2 },
    });
    simulator.start({ accountId: "a", request });
    expect(() => simulator.start({ accountId: "a", request })).toThrow("job_in_progress");
    simulator.start({ accountId: "b", request });
    expect(() => simulator.start({ accountId: "c", request })).toThrow("queue_full");
  });

  it("waits while the host is busy and starts once it is not", () => {
    vi.useFakeTimers();
    let busy = true;
    const worker = createFakeWorker();
    const simulator = new MatchupSimulator({ spawnWorker: () => worker.handle, isHostBusy: () => busy });
    const job = simulator.start({ accountId: "a", request });
    vi.advanceTimersByTime(10_000);
    expect(simulator.get({ accountId: "a", jobId: job.id })?.status).toBe("queued");
    busy = false;
    vi.advanceTimersByTime(2_000);
    worker.emit({ type: "ready" });
    expect(simulator.get({ accountId: "a", jobId: job.id })?.status).toBe("running");
    simulator.close();
  });

  it("stops a worker that runs past the time budget and starts a fresh one", () => {
    vi.useFakeTimers();
    const workers = [createFakeWorker(), createFakeWorker()];
    let spawned = 0;
    const simulator = new MatchupSimulator({
      spawnWorker: () => workers[spawned++]!.handle,
      isHostBusy: () => false,
      limits: { timeBudgetMs: 1_000, hungWorkerGraceMs: 500 },
    });
    const first = simulator.start({ accountId: "a", request });
    workers[0]!.emit({ type: "ready" });
    simulator.start({ accountId: "b", request });
    vi.advanceTimersByTime(1_500);
    expect(simulator.get({ accountId: "a", jobId: first.id })?.status).toBe("timed-out");
    expect(workers[0]!.terminations()).toBe(1);
    workers[1]!.emit({ type: "ready" });
    expect(workers[1]!.posted.some((message) => message.type === "run")).toBe(true);
    simulator.close();
  });

  it("fails the running job when the worker exits", () => {
    const worker = createFakeWorker();
    const simulator = new MatchupSimulator({ spawnWorker: () => worker.handle, isHostBusy: () => false });
    const job = simulator.start({ accountId: "a", request });
    worker.emit({ type: "ready" });
    worker.exit();
    expect(simulator.get({ accountId: "a", jobId: job.id })?.status).toBe("failed");
  });

  it("forgets finished jobs after their time to live", () => {
    let now = 0;
    const worker = createFakeWorker();
    const simulator = new MatchupSimulator({
      spawnWorker: () => worker.handle,
      isHostBusy: () => false,
      now: () => now,
      limits: { finishedJobTtlMs: 1_000 },
    });
    const job = simulator.start({ accountId: "a", request });
    worker.emit({ type: "ready" });
    worker.emit({ type: "finished", jobId: job.id, end: "timed-out" });
    expect(simulator.get({ accountId: "a", jobId: job.id })?.status).toBe("timed-out");
    now = 1_001;
    expect(simulator.get({ accountId: "a", jobId: job.id })).toBeUndefined();
    simulator.close();
  });
});
