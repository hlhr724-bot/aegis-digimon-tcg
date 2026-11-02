import { expect, it } from "vitest";
import { getSearchFailureFallback } from "#api/bot/search/getSearchFailureFallback";
import { LiveSearchFailure } from "#api/bot/search/LiveSearchFailure";
import { LiveSearchFallback } from "#api/bot/search/LiveSearchFallback";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";

it("counts a search that found no complete sample before the shared deadline as a deadline fallback", () => {
  const error = new Error("No valid paired samples reached the root");
  expect(getSearchFailureFallback({ error, deadlineEpochMs: currentEpochMs() - 1 })).toBe(
    LiveSearchFallback.DEADLINE.value,
  );
});

it("counts a search failure before the deadline as an error fallback", () => {
  const error = new Error("Snapshot continuation diverged before input 0");
  expect(getSearchFailureFallback({ error, deadlineEpochMs: currentEpochMs() + 60_000 })).toBe(
    LiveSearchFallback.ERROR.value,
  );
});

it("counts a worker-reported search error that arrives after the shared deadline as a deadline fallback", () => {
  const error = new LiveSearchFailure({
    fallback: LiveSearchFallback.ERROR.value,
    message: "No valid paired samples reached the root: continuationLimit",
  });
  expect(getSearchFailureFallback({ error, deadlineEpochMs: currentEpochMs() - 1 })).toBe(
    LiveSearchFallback.DEADLINE.value,
  );
});

it("counts a worker-reported search error before the shared deadline as an error fallback", () => {
  const error = new LiveSearchFailure({ fallback: LiveSearchFallback.ERROR.value, message: "Hidden sampling changed" });
  expect(getSearchFailureFallback({ error, deadlineEpochMs: currentEpochMs() + 60_000 })).toBe(
    LiveSearchFallback.ERROR.value,
  );
});

it("keeps the fallback a worker pool failure already names", () => {
  const error = new LiveSearchFailure({ fallback: LiveSearchFallback.CAPACITY.value, message: "full" });
  expect(getSearchFailureFallback({ error, deadlineEpochMs: currentEpochMs() - 1 })).toBe(
    LiveSearchFallback.CAPACITY.value,
  );
});
