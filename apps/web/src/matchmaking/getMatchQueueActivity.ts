import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { getMatchQueueKey } from "@aegis/shared/matchmaking/getMatchQueueKey";

export type MatchQueueActivity = {
  matching: number;
  total: number;
};

type Params = {
  counts: MatchQueueCounts;
  selection: MatchQueueSelection;
  viewerQueued: boolean;
};

export function getMatchQueueActivity({ counts, selection, viewerQueued }: Params): MatchQueueActivity {
  const selectedKey = getMatchQueueKey(selection);
  let matching = 0;
  let total = 0;
  for (const bucket of counts.buckets) {
    total += bucket.searching;
    if (getMatchQueueKey(bucket) === selectedKey) {
      matching += bucket.searching;
    }
  }
  const viewer = viewerQueued ? 1 : 0;
  return { matching: Math.max(0, matching - viewer), total: Math.max(0, total - viewer) };
}
