import { Worker } from "node:worker_threads";
import type { AvatarClassifier } from "#api/accounts/avatarClassifier";

type WorkerReply = { id: number; ok: true; nsfw: number } | { id: number; ok: false; reason: string };

type Pending = { resolve: (score: number) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export function localAvatarClassifier({
  modelPath,
  threshold,
  timeoutMs,
  idleMs,
}: {
  modelPath: string;
  threshold: number;
  timeoutMs: number;
  idleMs: number;
}): AvatarClassifier {
  let worker: Worker | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function settle(id: number, outcome: { score: number } | { error: Error }) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if ("score" in outcome) entry.resolve(outcome.score);
    else entry.reject(outcome.error);
    if (!pending.size) scheduleIdleStop();
  }

  function stop() {
    const stopping = worker;
    worker = undefined;
    if (stopping) void stopping.terminate().catch(() => undefined);
  }

  function failAll(error: Error) {
    for (const id of [...pending.keys()]) settle(id, { error });
    stop();
  }

  function scheduleIdleStop() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, idleMs);
    idleTimer.unref();
  }

  function activeWorker(): Worker {
    clearTimeout(idleTimer);
    if (worker) return worker;
    const started = new Worker(new URL("./avatarNsfwWorker.js", import.meta.url), { workerData: { modelPath } });
    started.on("message", (reply: WorkerReply) =>
      settle(reply.id, reply.ok ? { score: reply.nsfw } : { error: new Error(`local_classifier_${reply.reason}`) }),
    );
    started.on("error", (error: unknown) => failAll(error instanceof Error ? error : new Error(String(error))));
    started.on("exit", (code) => {
      if (worker !== started) return;
      worker = undefined;
      if (pending.size) failAll(new Error(`local_classifier_exited_${code}`));
    });
    worker = started;
    return started;
  }

  return {
    name: "local",
    async classify(image) {
      const target = activeWorker();
      const id = nextId++;
      const score = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          settle(id, { error: new Error("local_classifier_timeout") });
          if (worker === target) stop();
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        target.postMessage({ id, bytes: image.bytes });
      });
      return score >= threshold ? "nsfw" : "safe";
    },
  };
}
