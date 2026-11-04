import { randomInt, randomUUID } from "node:crypto";
import { MatchupGameResult } from "@aegis/shared/deckSimulation/MatchupGameResult";
import type { MatchupJob, MatchupSampleGame, MatchupTally } from "@aegis/shared/deckSimulation/MatchupJob";
import { MatchupJobStatus } from "@aegis/shared/deckSimulation/MatchupJobStatus";
import { matchupDeckKey } from "@aegis/shared/deckSimulation/matchupDeckKey";
import { createCgroupCpuBusyCheck } from "#api/deckSimulation/createCgroupCpuBusyCheck";
import type { FinishedMatchup } from "#api/deckSimulation/FinishedMatchup";
import { MATCHUP_LIMITS } from "#api/deckSimulation/MATCHUP_LIMITS";
import { MatchupLimitError } from "#api/deckSimulation/MatchupLimitError";
import type { MatchupRequest } from "#api/deckSimulation/MatchupRequest";
import type { MatchupWorkerHandle } from "#api/deckSimulation/MatchupWorkerHandle";
import type { MatchupWorkerMessage } from "#api/deckSimulation/MatchupWorkerMessage";
import { spawnMatchupWorker } from "#api/deckSimulation/spawnMatchupWorker";
import { wilsonScoreInterval } from "#api/deckSimulation/wilsonScoreInterval";
import { log } from "#api/logger";

type Counts = { wins: number; losses: number; draws: number; invalidGames: number };

type JobRecord = {
  id: string;
  accountId: string;
  request: MatchupRequest;
  status: MatchupJobStatus;
  counts: Counts[];
  samples: MatchupSampleGame[];
  replays: Map<number, Uint8Array>;
  createdAt: number;
  finishedAt?: number;
};

type WorkerSlot = {
  handle: MatchupWorkerHandle;
  ready: boolean;
  currentJobId?: string;
  hungTimer?: NodeJS.Timeout;
  idleTimer?: NodeJS.Timeout;
};

type Options = {
  spawnWorker?: () => MatchupWorkerHandle;
  isHostBusy?: () => boolean;
  now?: () => number;
  limits?: Partial<typeof MATCHUP_LIMITS>;
  onFinished?: (finished: FinishedMatchup) => void;
};

function tally(counts: Counts, requestedGames: number): MatchupTally {
  const completedGames = counts.wins + counts.losses + counts.draws;
  const points = counts.wins + counts.draws * MatchupGameResult.DRAW.points;
  return {
    requestedGames,
    completedGames,
    ...counts,
    score: completedGames === 0 ? null : points / completedGames,
    interval: wilsonScoreInterval({ points, games: completedGames }),
  };
}

function defaultHostBusyCheck(): () => boolean {
  return createCgroupCpuBusyCheck({
    spareCores: MATCHUP_LIMITS.spareCores,
    maxThrottledShare: MATCHUP_LIMITS.maxThrottledShare,
    minSampleWindowMs: MATCHUP_LIMITS.minCpuSampleWindowMs,
    maxSampleWindowMs: MATCHUP_LIMITS.maxCpuSampleWindowMs,
    hostLoadPerCore: MATCHUP_LIMITS.busyHostLoadPerCore,
  });
}

export class MatchupSimulator {
  readonly #jobs = new Map<string, JobRecord>();
  readonly #queue: string[] = [];
  readonly #spawnWorker: () => MatchupWorkerHandle;
  readonly #isHostBusy: () => boolean;
  readonly #now: () => number;
  readonly #limits: typeof MATCHUP_LIMITS;
  readonly #onFinished: ((finished: FinishedMatchup) => void) | undefined;
  #slot?: WorkerSlot;
  #retryTimer?: NodeJS.Timeout;

  constructor({
    spawnWorker = spawnMatchupWorker,
    isHostBusy = defaultHostBusyCheck(),
    now = Date.now,
    limits,
    onFinished,
  }: Options = {}) {
    this.#onFinished = onFinished;
    this.#spawnWorker = spawnWorker;
    this.#isHostBusy = isHostBusy;
    this.#now = now;
    this.#limits = { ...MATCHUP_LIMITS, ...limits };
  }

  start({ accountId, request }: { accountId: string; request: MatchupRequest }): MatchupJob {
    this.#prune();
    const active = [...this.#jobs.values()].filter(
      (job) => job.accountId === accountId && !this.#isFinished(job.status),
    ).length;
    if (active >= this.#limits.activeJobsPerAccount) throw new MatchupLimitError("job_in_progress");
    if (this.#queue.length >= this.#limits.queuedJobs) throw new MatchupLimitError("queue_full");
    const job: JobRecord = {
      id: randomUUID(),
      accountId,
      request,
      status: MatchupJobStatus.QUEUED.value,
      counts: request.opponents.map(() => ({ wins: 0, losses: 0, draws: 0, invalidGames: 0 })),
      samples: [],
      replays: new Map(),
      createdAt: this.#now(),
    };
    this.#jobs.set(job.id, job);
    this.#queue.push(job.id);
    this.#pump();
    return this.#view(job);
  }

  get({ accountId, jobId }: { accountId: string; jobId: string }): MatchupJob | undefined {
    this.#prune();
    const job = this.#jobs.get(jobId);
    return job?.accountId === accountId ? this.#view(job) : undefined;
  }

  replay({ accountId, jobId, index }: { accountId: string; jobId: string; index: number }): Uint8Array | undefined {
    this.#prune();
    const job = this.#jobs.get(jobId);
    const file = job?.accountId === accountId ? job.replays.get(index) : undefined;
    log("deckSimulation.replayOpened", {
      jobId,
      index,
      available: file !== undefined,
      ...(job?.finishedAt === undefined ? {} : { msSinceFinished: this.#now() - job.finishedAt }),
    });
    return file;
  }

  cancel({ accountId, jobId }: { accountId: string; jobId: string }): MatchupJob | undefined {
    const job = this.#jobs.get(jobId);
    if (job?.accountId !== accountId) return undefined;
    if (job.status === MatchupJobStatus.QUEUED.value) {
      this.#queue.splice(this.#queue.indexOf(jobId), 1);
      this.#settle(job, MatchupJobStatus.CANCELLED.value);
    } else if (job.status === MatchupJobStatus.RUNNING.value && this.#slot?.currentJobId === jobId) {
      this.#slot.handle.postMessage({ type: "cancel", jobId });
    }
    return this.#view(job);
  }

  close(): void {
    clearTimeout(this.#retryTimer);
    this.#retireWorker();
  }

  #isFinished(status: MatchupJobStatus): boolean {
    return Object.values(MatchupJobStatus).find((entry) => entry.value === status)!.isFinished;
  }

  #settle(job: JobRecord, status: MatchupJobStatus): void {
    job.status = status;
    job.finishedAt = this.#now();
    const view = this.#view(job);
    log("deckSimulation.finished", {
      jobId: job.id,
      status,
      durationMs: job.finishedAt - job.createdAt,
      completedGames: view.completedGames,
      requestedGames: view.requestedGames,
      invalidGames: view.invalidGames,
    });
    this.#retireWhenIdle();
    if (job.request.deckId === undefined || view.completedGames === 0) return;
    this.#onFinished?.({
      accountId: job.accountId,
      deckId: job.request.deckId,
      deckKey: matchupDeckKey(job.request.deck),
      job: { ...view, samples: [] },
    });
  }

  #prune(): void {
    this.#expireQueued();
    for (const [id, job] of this.#jobs) {
      if (job.finishedAt !== undefined && this.#now() - job.finishedAt > this.#limits.finishedJobTtlMs) {
        this.#jobs.delete(id);
      }
    }
  }

  #expireQueued(): void {
    for (const jobId of [...this.#queue]) {
      const job = this.#jobs.get(jobId)!;
      if (this.#now() - job.createdAt < this.#limits.queuedJobTimeoutMs) continue;
      this.#queue.splice(this.#queue.indexOf(jobId), 1);
      this.#settle(job, MatchupJobStatus.TIMED_OUT.value);
    }
  }

  #view(job: JobRecord): MatchupJob {
    const expiresFrom = job.finishedAt ?? this.#now();
    const total = job.counts.reduce(
      (sum, counts) => ({
        wins: sum.wins + counts.wins,
        losses: sum.losses + counts.losses,
        draws: sum.draws + counts.draws,
        invalidGames: sum.invalidGames + counts.invalidGames,
      }),
      { wins: 0, losses: 0, draws: 0, invalidGames: 0 },
    );
    return {
      id: job.id,
      status: job.status,
      ...tally(total, job.request.gamesPerOpponent * job.request.opponents.length),
      opponents: job.request.opponents.map((opponent, index) => ({
        name: opponent.name,
        ...(opponent.communityDeckId === undefined ? {} : { communityDeckId: opponent.communityDeckId }),
        ...(opponent.coverCardId === undefined ? {} : { coverCardId: opponent.coverCardId }),
        ...(opponent.colors === undefined ? {} : { colors: [...opponent.colors] }),
        ...tally(job.counts[index]!, job.request.gamesPerOpponent),
      })),
      samples: job.samples.map((sample) => ({ ...sample })),
      createdAt: new Date(job.createdAt).toISOString(),
      expiresAt: new Date(expiresFrom + this.#limits.finishedJobTtlMs).toISOString(),
    };
  }

  #pump(): void {
    this.#expireQueued();
    if (this.#slot?.currentJobId !== undefined || this.#queue.length === 0) return;
    const slot = this.#ensureWorker();
    clearTimeout(slot.idleTimer);
    const busy = this.#isHostBusy();
    if (!slot.ready) return;
    if (busy) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = setTimeout(() => this.#pump(), this.#limits.busyHostRetryMs);
      this.#retryTimer.unref();
      return;
    }
    const job = this.#jobs.get(this.#queue.shift()!)!;
    slot.currentJobId = job.id;
    job.status = MatchupJobStatus.RUNNING.value;
    log("deckSimulation.started", { jobId: job.id, queuedMs: this.#now() - job.createdAt });
    const deadlineEpochMs = this.#now() + this.#limits.timeBudgetMs;
    slot.hungTimer = setTimeout(
      () => this.#abandonHungWorker(job.id),
      this.#limits.timeBudgetMs + this.#limits.hungWorkerGraceMs,
    );
    slot.hungTimer.unref();
    slot.handle.postMessage({
      type: "run",
      task: {
        jobId: job.id,
        request: job.request,
        seed: randomInt(0, 2 ** 31),
        sampleLimit: this.#limits.sampleReplays,
        deadlineEpochMs,
      },
    });
  }

  #ensureWorker(): WorkerSlot {
    if (this.#slot !== undefined) return this.#slot;
    const slot: WorkerSlot = { handle: this.#spawnWorker(), ready: false };
    this.#slot = slot;
    slot.handle.onMessage((message) => this.#receive(slot, message));
    slot.handle.onExit(() => this.#workerExited(slot));
    return slot;
  }

  #receive(slot: WorkerSlot, message: MatchupWorkerMessage): void {
    if (this.#slot !== slot) return;
    if (message.type === "ready") {
      slot.ready = true;
      this.#pump();
      return;
    }
    const job = this.#jobs.get(message.jobId);
    if (job === undefined || message.jobId !== slot.currentJobId) return;
    if (message.type === "game") {
      const { outcome } = message;
      const counts = job.counts[message.opponentIndex];
      if (counts === undefined) return;
      if (outcome.result === MatchupGameResult.WIN.value) counts.wins++;
      else if (outcome.result === MatchupGameResult.LOSS.value) counts.losses++;
      else if (outcome.result === MatchupGameResult.DRAW.value) counts.draws++;
      else counts.invalidGames++;
      if (message.replayFile !== undefined && outcome.result !== undefined) {
        job.replays.set(message.index, message.replayFile);
        job.samples.push({
          index: message.index,
          opponentIndex: message.opponentIndex,
          wentFirst: message.playerFirst,
          result: outcome.result,
          reason: outcome.reason,
          turns: outcome.turns,
        });
      }
      return;
    }
    this.#finish(
      slot,
      job,
      message.type === "failed"
        ? MatchupJobStatus.FAILED.value
        : message.end === "completed"
          ? MatchupJobStatus.COMPLETED.value
          : message.end === "timed-out"
            ? MatchupJobStatus.TIMED_OUT.value
            : MatchupJobStatus.CANCELLED.value,
    );
  }

  #finish(slot: WorkerSlot, job: JobRecord, status: MatchupJobStatus): void {
    clearTimeout(slot.hungTimer);
    slot.currentJobId = undefined;
    this.#settle(job, status);
    this.#pump();
  }

  #retireWhenIdle(): void {
    const slot = this.#slot;
    if (slot === undefined || slot.currentJobId !== undefined || this.#queue.length > 0) return;
    clearTimeout(slot.idleTimer);
    slot.idleTimer = setTimeout(() => this.#retireWorker(), this.#limits.idleWorkerMs);
    slot.idleTimer.unref();
  }

  #abandonHungWorker(jobId: string): void {
    const slot = this.#slot;
    if (slot?.currentJobId !== jobId) return;
    this.#settle(this.#jobs.get(jobId)!, MatchupJobStatus.TIMED_OUT.value);
    this.#retireWorker();
    this.#pump();
  }

  #workerExited(slot: WorkerSlot): void {
    if (this.#slot !== slot) return;
    const job = slot.currentJobId === undefined ? undefined : this.#jobs.get(slot.currentJobId);
    if (job !== undefined && !this.#isFinished(job.status)) this.#settle(job, MatchupJobStatus.FAILED.value);
    this.#retireWorker();
    this.#pump();
  }

  #retireWorker(): void {
    const slot = this.#slot;
    if (slot === undefined) return;
    this.#slot = undefined;
    clearTimeout(slot.hungTimer);
    clearTimeout(slot.idleTimer);
    slot.handle.terminate();
  }
}
