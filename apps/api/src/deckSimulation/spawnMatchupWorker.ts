import { Worker } from "node:worker_threads";
import type { MatchupWorkerHandle } from "#api/deckSimulation/MatchupWorkerHandle";
import type { MatchupWorkerMessage } from "#api/deckSimulation/MatchupWorkerMessage";
import { MATCHUP_LIMITS } from "#api/deckSimulation/MATCHUP_LIMITS";

export function spawnMatchupWorker(): MatchupWorkerHandle {
  const worker = new Worker(
    new URL(import.meta.url.endsWith(".ts") ? "./matchupWorker.ts" : "./matchupWorker.js", import.meta.url),
    { resourceLimits: { maxOldGenerationSizeMb: MATCHUP_LIMITS.workerHeapMb } },
  );
  worker.unref();
  return {
    postMessage: (request) => worker.postMessage(request),
    onMessage: (listener) => worker.on("message", (message: MatchupWorkerMessage) => listener(message)),
    onExit: (listener) => {
      worker.on("exit", listener);
      worker.on("error", listener);
    },
    terminate: () => void worker.terminate(),
  };
}
