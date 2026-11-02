import { useEffect, useState } from "react";
import type { LogEntry } from "@/game/log/LogEntry";

type Params = { entries: readonly LogEntry[]; open: boolean };

export function useUnreadLogCount({ entries, open }: Params): number {
  const [seenCount, setSeenCount] = useState(entries.length);
  useEffect(() => {
    if (open || entries.length < seenCount) {
      setSeenCount(entries.length);
    }
  }, [open, entries.length, seenCount]);
  if (open) {
    return 0;
  }
  return entries.slice(seenCount).filter((entry) => entry.kind !== "you").length;
}
