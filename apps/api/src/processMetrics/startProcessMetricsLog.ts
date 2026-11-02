import { performance } from "node:perf_hooks";
import type { LiveSearchWorkerUsage } from "#api/bot/search/LiveSearchWorkerUsage";
import { buildProcessMetricsReport } from "#api/processMetrics/buildProcessMetricsReport";
import type { ProcessMetricsSample } from "#api/processMetrics/ProcessMetricsSample";
import type { RoomCounts } from "#api/processMetrics/RoomCounts";
import { log } from "#api/logger";

const PROCESS_METRICS_INTERVAL_MS = 60_000;

type Params = { readSearchUsage: () => LiveSearchWorkerUsage; countRooms: () => RoomCounts };

export function startProcessMetricsLog({ readSearchUsage, countRooms }: Params): () => void {
  function readSample(): ProcessMetricsSample {
    const { user, system } = process.cpuUsage();
    return {
      atMs: performance.now(),
      processCpuMicros: user + system,
      mainThreadActiveMs: performance.eventLoopUtilization().active,
      search: readSearchUsage(),
    };
  }
  let previous = readSample();
  const timer = setInterval(() => {
    const current = readSample();
    log("[aegis/api] process metrics", buildProcessMetricsReport({ previous, current, roomCounts: countRooms() }));
    previous = current;
  }, PROCESS_METRICS_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
