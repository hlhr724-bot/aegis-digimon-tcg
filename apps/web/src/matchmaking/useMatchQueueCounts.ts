import { useEffect, useState } from "react";
import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import { matchQueueCounts } from "@/net/client";

const REFRESH_INTERVAL_MS = 10_000;

type Params = {
  load?: () => Promise<MatchQueueCounts>;
  enabled?: boolean;
};

export function useMatchQueueCounts({ load = matchQueueCounts, enabled = true }: Params = {}):
  | MatchQueueCounts
  | undefined {
  const [counts, setCounts] = useState<MatchQueueCounts>();
  useEffect(() => {
    if (!enabled) {
      setCounts(undefined);
      return;
    }
    let mounted = true;
    function refresh() {
      void load()
        .then((next) => {
          if (mounted) {
            setCounts(next);
          }
        })
        .catch(() => {
          if (mounted) {
            setCounts(undefined);
          }
        });
    }
    refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        refresh();
      }
    }, REFRESH_INTERVAL_MS);
    function onVisibilityChange() {
      if (!document.hidden) {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, enabled]);
  return counts;
}
