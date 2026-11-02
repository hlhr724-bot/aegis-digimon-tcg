import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { LiveSearchFailure } from "#api/bot/search/LiveSearchFailure";
import { LiveSearchFallback } from "#api/bot/search/LiveSearchFallback";

type Params = { error: unknown; deadlineEpochMs: number };

export function getSearchFailureFallback({ error, deadlineEpochMs }: Params): LiveSearchFallback {
  if (error instanceof LiveSearchFailure && error.fallback !== LiveSearchFallback.ERROR.value) {
    return error.fallback;
  }
  if (currentEpochMs() >= deadlineEpochMs) {
    return LiveSearchFallback.DEADLINE.value;
  }
  return LiveSearchFallback.ERROR.value;
}
