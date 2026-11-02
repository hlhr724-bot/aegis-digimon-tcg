import type { ProcessMetricsReport } from "#api/processMetrics/ProcessMetricsReport";
import type { ProcessMetricsSample } from "#api/processMetrics/ProcessMetricsSample";
import type { RoomCounts } from "#api/processMetrics/RoomCounts";

type Params = { previous: ProcessMetricsSample; current: ProcessMetricsSample; roomCounts: RoomCounts };

type SearchShareParams = { searchActiveMs: number; processCpuMs: number };

function roundToThousandths(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function getSearchShare({ searchActiveMs, processCpuMs }: SearchShareParams): number {
  if (processCpuMs <= 0) {
    return 0;
  }
  return roundToThousandths(Math.min(1, searchActiveMs / processCpuMs));
}

export function buildProcessMetricsReport({ previous, current, roomCounts }: Params): ProcessMetricsReport {
  const intervalMs = Math.max(1, current.atMs - previous.atMs);
  const processCpuMs = (current.processCpuMicros - previous.processCpuMicros) / 1_000;
  const searchActiveMs = current.search.activeMs - previous.search.activeMs;
  const mainThreadActiveMs = current.mainThreadActiveMs - previous.mainThreadActiveMs;
  return {
    intervalMs,
    processCpuCores: roundToThousandths(processCpuMs / intervalMs),
    mainThreadUtilization: roundToThousandths(mainThreadActiveMs / intervalMs),
    searchBusyCores: roundToThousandths(searchActiveMs / intervalMs),
    searchShareOfProcessCpu: getSearchShare({ searchActiveMs, processCpuMs }),
    searchesStarted: current.search.started - previous.search.started,
    searchesCompleted: current.search.completed - previous.search.completed,
    searchDeadlineFallbacks: current.search.fallbacks.deadline - previous.search.fallbacks.deadline,
    searchCapacityFallbacks: current.search.fallbacks.capacity - previous.search.fallbacks.capacity,
    searchErrorFallbacks: current.search.fallbacks.error - previous.search.fallbacks.error,
    ...roomCounts,
  };
}
