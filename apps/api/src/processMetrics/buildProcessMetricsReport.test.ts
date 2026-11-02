import { expect, it } from "vitest";
import { buildProcessMetricsReport } from "#api/processMetrics/buildProcessMetricsReport";
import type { ProcessMetricsSample } from "#api/processMetrics/ProcessMetricsSample";

const roomCounts = { rooms: 12, botRooms: 5, clients: 19 };

function createSample(overrides: Partial<ProcessMetricsSample> = {}): ProcessMetricsSample {
  return {
    atMs: 0,
    processCpuMicros: 0,
    mainThreadActiveMs: 0,
    search: { activeMs: 0, started: 0, completed: 0, fallbacks: { deadline: 0, capacity: 0, error: 0 } },
    ...overrides,
  };
}

it("reports interval CPU in cores and the share spent in bot search", () => {
  const report = buildProcessMetricsReport({
    previous: createSample({
      atMs: 1_000,
      processCpuMicros: 5_000_000,
      mainThreadActiveMs: 2_000,
      search: { activeMs: 4_000, started: 10, completed: 8, fallbacks: { deadline: 1, capacity: 0, error: 1 } },
    }),
    current: createSample({
      atMs: 61_000,
      processCpuMicros: 35_000_000,
      mainThreadActiveMs: 14_000,
      search: { activeMs: 22_000, started: 40, completed: 35, fallbacks: { deadline: 3, capacity: 2, error: 1 } },
    }),
    roomCounts,
  });
  expect(report).toEqual({
    intervalMs: 60_000,
    processCpuCores: 0.5,
    mainThreadUtilization: 0.2,
    searchBusyCores: 0.3,
    searchShareOfProcessCpu: 0.6,
    searchesStarted: 30,
    searchesCompleted: 27,
    searchDeadlineFallbacks: 2,
    searchCapacityFallbacks: 2,
    searchErrorFallbacks: 0,
    ...roomCounts,
  });
});

it("reports no search share when the process used no CPU in the interval", () => {
  const report = buildProcessMetricsReport({
    previous: createSample(),
    current: createSample({ atMs: 60_000 }),
    roomCounts,
  });
  expect(report.searchShareOfProcessCpu).toBe(0);
  expect(report.processCpuCores).toBe(0);
});

it("caps the search share at the whole process when worker wall time exceeds throttled CPU", () => {
  const report = buildProcessMetricsReport({
    previous: createSample(),
    current: createSample({
      atMs: 60_000,
      processCpuMicros: 10_000_000,
      search: { activeMs: 20_000, started: 1, completed: 1, fallbacks: { deadline: 0, capacity: 0, error: 0 } },
    }),
    roomCounts,
  });
  expect(report.searchShareOfProcessCpu).toBe(1);
});
