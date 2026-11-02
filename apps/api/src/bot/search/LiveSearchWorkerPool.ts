import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { BotSearchResult, BotSearchTask } from "#api/bot/search/BotSearchTask";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { LiveSearchFailure } from "#api/bot/search/LiveSearchFailure";
import { LiveSearchFallback, type LiveSearchFallbackCounts } from "#api/bot/search/LiveSearchFallback";
import type { LiveSearchWorkerUsage } from "#api/bot/search/LiveSearchWorkerUsage";

const RESPONSE_GRACE_MS = 150;
const HUNG_WORKER_LIMIT_MS = 2_000;

type Response = { id: string; ok: true; result: BotSearchResult } | { id: string; ok: false; error: string };
type WorkerMessage = Response | { type: "ready" };

type Pending = {
  id: string;
  task: BotSearchTask;
  signal: AbortSignal;
  resolve: (result: BotSearchResult) => void;
  reject: (error: Error) => void;
  abort: () => void;
  timer: NodeJS.Timeout;
  settled: boolean;
};

type Slot = {
  worker: Worker;
  ready: boolean;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  current?: Pending;
  hungTimer?: NodeJS.Timeout;
};

export class LiveSearchWorkerPool {
  private readonly slots: Slot[] = [];
  private readonly queue: Pending[] = [];
  private readonly workerLimit: number;
  private readonly queueLimit: number;
  private retiredActiveMs = 0;
  private started = 0;
  private completed = 0;
  private readonly fallbacks: LiveSearchFallbackCounts = {
    [LiveSearchFallback.DEADLINE.value]: 0,
    [LiveSearchFallback.CAPACITY.value]: 0,
    [LiveSearchFallback.ERROR.value]: 0,
  };

  constructor(workerLimit = Math.max(1, Math.min(2, availableParallelism() - 1))) {
    this.workerLimit = workerLimit;
    this.queueLimit = workerLimit * 2;
  }

  run({ task, signal }: { task: BotSearchTask; signal: AbortSignal }): Promise<BotSearchResult> {
    return this.search({ task, signal }).catch((error: unknown) => {
      if (error instanceof LiveSearchFailure) {
        this.fallbacks[error.fallback] += 1;
      }
      throw error;
    });
  }

  private search({ task, signal }: { task: BotSearchTask; signal: AbortSignal }): Promise<BotSearchResult> {
    if (signal.aborted) return Promise.reject(new Error("Bot search was cancelled"));
    if (!this.slots.some((slot) => slot.ready)) {
      void this.prewarm().catch(() => undefined);
      return Promise.reject(
        new LiveSearchFailure({ fallback: LiveSearchFallback.CAPACITY.value, message: "No search worker is warm" }),
      );
    }
    if (task.deadlineEpochMs <= currentEpochMs()) {
      return Promise.reject(
        new LiveSearchFailure({ fallback: LiveSearchFallback.DEADLINE.value, message: "Bot search deadline passed" }),
      );
    }
    if (this.queue.length >= this.queueLimit && this.slots.every((slot) => slot.current !== undefined)) {
      return Promise.reject(
        new LiveSearchFailure({ fallback: LiveSearchFallback.CAPACITY.value, message: "Bot search capacity is full" }),
      );
    }
    return new Promise<BotSearchResult>((resolve, reject) => {
      const pending: Pending = {
        id: randomUUID(),
        task,
        signal,
        resolve,
        reject,
        abort: () => this.release(pending, new Error("Bot search was cancelled")),
        timer: setTimeout(
          () =>
            this.release(
              pending,
              new LiveSearchFailure({
                fallback: LiveSearchFallback.DEADLINE.value,
                message: "Bot search exceeded its deadline",
              }),
            ),
          Math.max(0, task.deadlineEpochMs + RESPONSE_GRACE_MS - currentEpochMs()),
        ),
        settled: false,
      };
      signal.addEventListener("abort", pending.abort, { once: true });
      this.queue.push(pending);
      this.dispatch();
    });
  }

  readUsage(): LiveSearchWorkerUsage {
    return {
      activeMs:
        this.retiredActiveMs +
        this.slots.reduce((total, slot) => total + slot.worker.performance.eventLoopUtilization().active, 0),
      started: this.started,
      completed: this.completed,
      fallbacks: { ...this.fallbacks },
    };
  }

  async prewarm(): Promise<void> {
    while (this.slots.length < this.workerLimit) this.slots.push(this.createSlot());
    await Promise.all(this.slots.map((slot) => slot.readyPromise));
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      let slot = this.slots.find((entry) => entry.ready && entry.current === undefined);
      if (slot === undefined && this.slots.length < this.workerLimit) {
        slot = this.createSlot();
        this.slots.push(slot);
      }
      if (slot === undefined || !slot.ready) return;
      const pending = this.queue.shift()!;
      slot.current = pending;
      this.started += 1;
      slot.worker.ref();
      slot.worker.postMessage({ id: pending.id, serializedTask: JSON.stringify(pending.task) });
    }
  }

  private release(pending: Pending, error: Error): void {
    if (pending.settled) return;
    const queuedIndex = this.queue.indexOf(pending);
    if (queuedIndex >= 0) this.queue.splice(queuedIndex, 1);
    const slot = this.slots.find((entry) => entry.current === pending);
    if (slot !== undefined) {
      slot.worker.postMessage({ id: pending.id, cancel: true });
      slot.hungTimer ??= setTimeout(() => this.replace(slot), HUNG_WORKER_LIMIT_MS);
    }
    this.settle(pending, () => pending.reject(error));
  }

  private createSlot(): Slot {
    const workerUrl = new URL(
      import.meta.url.endsWith(".ts") ? "./searchWorker.ts" : "./searchWorker.js",
      import.meta.url,
    );
    const worker = new Worker(workerUrl);
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    readyPromise.catch(() => undefined);
    const slot: Slot = { worker, ready: false, readyPromise, resolveReady, rejectReady };
    worker.on("message", (message: WorkerMessage) => {
      if ("type" in message && message.type === "ready") {
        slot.ready = true;
        slot.resolveReady();
        worker.unref();
        this.dispatch();
        return;
      }
      const response = message as Response;
      if (slot.current?.id !== response.id) return;
      const pending = slot.current;
      slot.current = undefined;
      clearTimeout(slot.hungTimer);
      slot.hungTimer = undefined;
      worker.unref();
      if (response.ok) {
        this.completed += 1;
      }
      this.settle(pending, () =>
        response.ok
          ? pending.resolve(response.result)
          : pending.reject(
              new LiveSearchFailure({ fallback: LiveSearchFallback.ERROR.value, message: response.error }),
            ),
      );
      this.dispatch();
    });
    worker.on("error", (error) => this.fail(slot, error instanceof Error ? error : new Error(String(error))));
    worker.on("exit", (code) => {
      if (code !== 0 || slot.current !== undefined)
        this.fail(slot, new Error(`Search worker exited with code ${code}`));
    });
    return slot;
  }

  private replace(slot: Slot): void {
    const index = this.slots.indexOf(slot);
    if (index < 0) return;
    const pending = slot.current;
    slot.current = undefined;
    clearTimeout(slot.hungTimer);
    this.slots.splice(index, 1, this.createSlot());
    this.retire(slot);
    if (pending !== undefined) {
      this.settle(pending, () =>
        pending.reject(
          new LiveSearchFailure({ fallback: LiveSearchFallback.ERROR.value, message: "Search worker was replaced" }),
        ),
      );
    }
    this.dispatch();
  }

  private fail(slot: Slot, error: Error): void {
    const index = this.slots.indexOf(slot);
    if (index < 0) return;
    if (slot.ready) {
      this.replace(slot);
      return;
    }
    slot.rejectReady(error);
    this.slots.splice(index, 1);
    this.retire(slot);
    this.dispatch();
  }

  private retire(slot: Slot): void {
    this.retiredActiveMs += slot.worker.performance.eventLoopUtilization().active;
    void slot.worker.terminate();
  }

  private settle(pending: Pending, complete: () => void): void {
    if (pending.settled) return;
    pending.settled = true;
    clearTimeout(pending.timer);
    pending.signal.removeEventListener("abort", pending.abort);
    complete();
  }
}
