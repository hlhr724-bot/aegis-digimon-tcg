import { setPriority } from "node:os";
import { parentPort } from "node:worker_threads";
import type { BotSearchTask } from "#api/bot/search/BotSearchTask";
import { getEngineCodeFingerprint } from "#api/engine/snapshot/getEngineCodeFingerprint";

const SEARCH_THREAD_NICENESS = 10;

function yieldCpuToRoomThread(): void {
  if (process.platform !== "linux") return;
  try {
    setPriority(SEARCH_THREAD_NICENESS);
  } catch (error) {
    process.stderr.write(`[searchWorker] could not lower search thread priority: ${String(error)}\n`);
  }
}

yieldCpuToRoomThread();
console.log = console.info = console.debug = console.warn = () => {};
await import("#api/cards/index");
const { runBotSearchTask } = await import("#api/bot/search/runBotSearchTask");
getEngineCodeFingerprint();

type Request = { id: string; serializedTask: string } | { id: string; cancel: true };
const active = new Map<string, AbortController>();

if (parentPort === null) throw new Error("Search worker requires a parent port");

parentPort.on("message", (request: Request) => {
  if ("cancel" in request) {
    active.get(request.id)?.abort();
    return;
  }
  const controller = new AbortController();
  active.set(request.id, controller);
  const task = JSON.parse(request.serializedTask) as BotSearchTask;
  void runBotSearchTask({ task, signal: controller.signal })
    .then((result) => parentPort!.postMessage({ id: request.id, ok: true, result }))
    .catch((error: unknown) =>
      parentPort!.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    .finally(() => active.delete(request.id));
});

parentPort.postMessage({ type: "ready" });
