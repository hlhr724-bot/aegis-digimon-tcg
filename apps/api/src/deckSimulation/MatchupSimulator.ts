import { randomInt, randomUUID } from "node:crypto";
import { availableParallelism, loadavg } from "node:os";
import { MatchupGameResult } from "@aegis/shared/deckSimulation/MatchupGameResult";
import type { MatchupJob, MatchupSampleGame, MatchupTally } from "@aegis/shared/deckSimulation/MatchupJob";
import { MatchupJobStatus } from "@aegis/shared/deckSimulation/MatchupJobStatus";
import { MATCHUP_LIMITS } from "#api/deckSimulation/MATCHUP_LIMITS";
import { MatchupLimitError } from "#api/deckSimulation/MatchupLimitError";
import type { MatchupRequest } from "#api/deckSimulation/MatchupRequest";
import type { MatchupWorkerHandle } from "#api/deckSimulation/MatchupWorkerHandle";
import type { MatchupWorkerMessage } from "#api/deckSimulation/MatchupWorkerMessage";
import { spawnMatchupWorker } from "#api/deckSimulation/spawnMatchupWorker";
import { wilsonScoreInterval } from "#api/deckSimulation/wilsonScoreInterval";

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

function hostIsBusy(): boolean {
  return loadavg()[0]! > availableParallelism() * MATCHUP_LIMITS.busyHostLoadPerCore;
}

export class MatchupSimulator {
  readonly #jobs = new Map<string, JobRecord>();
  readonly #queue: string[] = [];
  readonly #spawnWorker: () => MatchupWorkerHandle;
  readonly #isHostBusy: () => boolean;
  readonly #now: () => number;
  readonly #limits: typeof MATCHUP_LIMITS;
  #slot?: WorkerSlot;
  #retryTimer?: NodeJS.Timeout;

  constructor({ spawnWorker = spawnMatchupWorker, isHostBusy = hostIsBusy, now = Date.now, limits }: Options = {}) {
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
    return job?.accountId === accountId ? job.replays.get(index) : undefined;
  }

  cancel({ accountId, jobId }: { accountId: string; jobId: string }): MatchupJob | undefined {
    const job = this.#jobs.get(jobId);
    if (job?.accountId !== accountId) return undefined;
    if (job.status === MatchupJobStatus.QUEUED.value) {
      this.#queue.splice(this.#queue.indexOf(jobId), 1);
      job.status = MatchupJobStatus.CANCELLED.value;
      job.finishedAt = this.#now();
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

  #prune(): void {
    for (const [id, job] of this.#jobs) {
      if (job.finishedAt !== undefined && this.#now() - job.finishedAt > this.#limits.finishedJobTtlMs) {
        this.#jobs.delete(id);
      }
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
        ...tally(job.counts[index]!, job.request.gamesPerOpponent),
      })),
      samples: job.samples.map((sample) => ({ ...sample })),
      createdAt: new Date(job.createdAt).toISOString(),
      expiresAt: new Date(expiresFrom + this.#limits.finishedJobTtlMs).toISOString(),
    };
  }

  #pump(): void {
    if (this.#slot?.currentJobId !== undefined || this.#queue.length === 0) return;
    if (this.#isHostBusy()) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = setTimeout(() => this.#pump(), this.#limits.busyHostRetryMs);
      this.#retryTimer.unref();
      return;
    }
    const slot = this.#ensureWorker();
    if (!slot.ready) return;
    const job = this.#jobs.get(this.#queue.shift()!)!;
    clearTimeout(slot.idleTimer);
    slot.currentJobId = job.id;
    job.status = MatchupJobStatus.RUNNING.value;
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
    job.status = status;
    job.finishedAt = this.#now();
    if (this.#queue.length === 0) {
      slot.idleTimer = setTimeout(() => this.#retireWorker(), this.#limits.idleWorkerMs);
      slot.idleTimer.unref();
    }
    this.#pump();
  }

  #abandonHungWorker(jobId: string): void {
    const slot = this.#slot;
    if (slot?.currentJobId !== jobId) return;
    const job = this.#jobs.get(jobId)!;
    job.status = MatchupJobStatus.TIMED_OUT.value;
    job.finishedAt = this.#now();
    this.#retireWorker();
    this.#pump();
  }

  #workerExited(slot: WorkerSlot): void {
    if (this.#slot !== slot) return;
    const job = slot.currentJobId === undefined ? undefined : this.#jobs.get(slot.currentJobId);
    if (job !== undefined && !this.#isFinished(job.status)) {
      job.status = MatchupJobStatus.FAILED.value;
      job.finishedAt = this.#now();
    }
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
