export type ArenaLongTaskLog = {
  overlaps: (start: number, end: number) => boolean;
  dispose: () => void;
};

const LOG_SIZE = 64;

function supportsLongTasks(): boolean {
  return (
    typeof PerformanceObserver !== "undefined" && (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask")
  );
}

export function createArenaLongTaskLog(): ArenaLongTaskLog {
  const starts = new Float64Array(LOG_SIZE);
  const ends = new Float64Array(LOG_SIZE);
  let count = 0;
  let next = 0;
  if (!supportsLongTasks()) {
    return { overlaps: () => false, dispose: () => undefined };
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      starts[next] = entry.startTime;
      ends[next] = entry.startTime + entry.duration;
      next = (next + 1) % LOG_SIZE;
      count = Math.min(LOG_SIZE, count + 1);
    }
  });
  observer.observe({ type: "longtask" });
  return {
    overlaps(start, end) {
      for (let index = 0; index < count; index += 1) {
        if (starts[index]! < end && ends[index]! > start) {
          return true;
        }
      }
      return false;
    },
    dispose: () => observer.disconnect(),
  };
}
