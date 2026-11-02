import type { LogEntry } from "@/game/log/LogEntry";

type Params = { entries: readonly LogEntry[]; limit?: number };

export function flattenRecentLogEntries({ entries, limit = 30 }: Params): LogEntry[] {
  if (limit <= 0) {
    return [];
  }
  return entries.slice(-limit).reverse();
}
