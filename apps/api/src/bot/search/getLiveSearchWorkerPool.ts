import { LiveSearchWorkerPool } from "#api/bot/search/LiveSearchWorkerPool";

const pool = new LiveSearchWorkerPool();

export function getLiveSearchWorkerPool(): LiveSearchWorkerPool {
  return pool;
}
