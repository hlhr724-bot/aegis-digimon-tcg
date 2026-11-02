import { getLiveSearchWorkerPool } from "#api/bot/search/getLiveSearchWorkerPool";

export function prewarmLiveSearchWorkers(): Promise<void> {
  return getLiveSearchWorkerPool().prewarm();
}
