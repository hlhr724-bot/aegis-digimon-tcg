import type { BotSearchResult, BotSearchTask } from "#api/bot/search/BotSearchTask";
import { getLiveSearchWorkerPool } from "#api/bot/search/getLiveSearchWorkerPool";

export function runLiveSearchInWorker({
  task,
  signal,
}: {
  task: BotSearchTask;
  signal: AbortSignal;
}): Promise<BotSearchResult> {
  return getLiveSearchWorkerPool().run({ task, signal });
}
