import { monitorEventLoopDelay, performance, type ELDHistogram } from "node:perf_hooks";
import type { LiveSearchWorkerUsage } from "#api/bot/search/LiveSearchWorkerUsage";
import { buildProcessMetricsReport } from "#api/processMetrics/buildProcessMetricsReport";
import type { EventLoopDelaySummary } from "#api/processMetrics/EventLoopDelaySummary";
import type { ProcessMetricsSample } from "#api/processMetrics/ProcessMetricsSample";
import type { RoomCounts } from "#api/processMetrics/RoomCounts";
import { log } from "#api/logger";

const PROCESS_METRICS_INTERVAL_MS = 60_000;
const EVENT_LOOP_DELAY_RESOLUTION_MS = 10;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

type Params = { readSearchUsage: () => LiveSearchWorkerUsage; countRooms: () => RoomCounts };

function drainEventLoopDelay(histogram: ELDHistogram): EventLoopDelaySummary {
  const summary = {
    p99Ms: histogram.percentile(99) / NANOSECONDS_PER_MILLISECOND,
    maxMs: histogram.max / NANOSECONDS_PER_MILLISECOND,
  };
  histogram.reset();
  return summary;
}

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
  const eventLoopDelayHistogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_DELAY_RESOLUTION_MS });
  eventLoopDelayHistogram.enable();
  let previous = readSample();
  const timer = setInterval(() => {
    const current = readSample();
    log(
      "[aegis/api] process metrics",
      buildProcessMetricsReport({
        previous,
        current,
        eventLoopDelay: drainEventLoopDelay(eventLoopDelayHistogram),
        roomCounts: countRooms(),
      }),
    );
    previous = current;
  }, PROCESS_METRICS_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    eventLoopDelayHistogram.disable();
  };
}
