import { parentPort } from "node:worker_threads";
import type { MatchupWorkerMessage, MatchupWorkerRequest } from "#api/deckSimulation/MatchupWorkerMessage";

console.log = console.info = console.debug = console.warn = () => {};
await import("#api/cards/index");
const { runMatchupJob } = await import("#api/deckSimulation/runMatchupJob");

if (parentPort === null) throw new Error("Matchup worker requires a parent port");
const port = parentPort;
const active = new Map<string, AbortController>();
const send = (message: MatchupWorkerMessage) => port.postMessage(message);

port.on("message", (request: MatchupWorkerRequest) => {
  if (request.type === "cancel") {
    active.get(request.jobId)?.abort();
    return;
  }
  const { task } = request;
  const controller = new AbortController();
  active.set(task.jobId, controller);
  void runMatchupJob({
    task,
    signal: controller.signal,
    onGame: (game) => send({ type: "game", jobId: task.jobId, ...game }),
  })
    .then((end) => send({ type: "finished", jobId: task.jobId, end }))
    .catch((error: unknown) =>
      send({ type: "failed", jobId: task.jobId, error: error instanceof Error ? error.message : String(error) }),
    )
    .finally(() => active.delete(task.jobId));
});

send({ type: "ready" });
