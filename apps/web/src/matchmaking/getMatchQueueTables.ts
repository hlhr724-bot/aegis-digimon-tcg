import { MatchQueue } from "@aegis/shared/matchmaking/MatchQueue";
import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { getMatchQueueKey } from "@aegis/shared/matchmaking/getMatchQueueKey";

export type MatchQueueTable = {
  key: string;
  selection: MatchQueueSelection;
  searching: number;
  longestWaitSeconds?: number;
};

type Params = {
  counts: MatchQueueCounts;
};

export function getMatchQueueTables({ counts }: Params): MatchQueueTable[] {
  const longestWaitByKey = new Map<string, number>();
  for (const { waitingSeconds, ...selection } of counts.waiting) {
    const key = getMatchQueueKey(selection);
    longestWaitByKey.set(key, Math.max(longestWaitByKey.get(key) ?? 0, waitingSeconds));
  }
  return counts.buckets
    .filter(({ queue, searching }) => queue !== MatchQueue.RANKED.value && searching > 0)
    .map(({ searching, ...selection }) => {
      const key = getMatchQueueKey(selection);
      return { key, selection, searching, longestWaitSeconds: longestWaitByKey.get(key) };
    })
    .sort(
      (first, second) =>
        (second.longestWaitSeconds ?? -1) - (first.longestWaitSeconds ?? -1) || second.searching - first.searching,
    );
}
