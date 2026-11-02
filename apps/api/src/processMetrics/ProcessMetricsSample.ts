import type { LiveSearchWorkerUsage } from "#api/bot/search/LiveSearchWorkerUsage";

export type ProcessMetricsSample = {
  atMs: number;
  processCpuMicros: number;
  mainThreadActiveMs: number;
  search: LiveSearchWorkerUsage;
};
