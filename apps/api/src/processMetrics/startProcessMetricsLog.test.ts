import { afterEach, expect, it, vi } from "vitest";
import { addLogSink } from "#api/logger";
import { startProcessMetricsLog } from "#api/processMetrics/startProcessMetricsLog";

afterEach(() => {
  vi.useRealTimers();
});

it("logs one process metrics line per minute with search usage and room counts", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const lines: string[] = [];
  const stopObserving = addLogSink((line) => lines.push(line));
  let started = 0;
  const stop = startProcessMetricsLog({
    readSearchUsage: () => ({ activeMs: 0, started, completed: 0, fallbacks: { deadline: 0, capacity: 0, error: 0 } }),
    countRooms: () => ({ rooms: 3, botRooms: 2, clients: 4 }),
  });
  started = 7;
  vi.advanceTimersByTime(60_000);
  stop();
  vi.advanceTimersByTime(60_000);
  stopObserving();
  const metricLines = lines.filter((line) => line.includes("[aegis/api] process metrics"));
  expect(metricLines).toHaveLength(1);
  const [, report] = (JSON.parse(metricLines[0]!) as { data: [string, Record<string, number>] }).data;
  expect(report).toMatchObject({ searchesStarted: 7, rooms: 3, botRooms: 2, clients: 4 });
});
