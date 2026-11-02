import type { LiveSearchFallbackCounts } from "#api/bot/search/LiveSearchFallback";

export type LiveSearchWorkerUsage = {
  activeMs: number;
  started: number;
  completed: number;
  fallbacks: LiveSearchFallbackCounts;
};
