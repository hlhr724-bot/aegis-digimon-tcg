import type { MatchQueueSelection } from "#shared/matchmaking/MatchQueueSelection";
import type { MatchQueueWaitingPlayer } from "#shared/matchmaking/MatchQueueWaitingPlayer";

export const MATCH_QUEUE_COUNTS_PATH = "/matchmaking/queues";

export type MatchQueueCount = MatchQueueSelection & {
  searching: number;
};

export type MatchQueueCounts = {
  buckets: MatchQueueCount[];
  waiting: MatchQueueWaitingPlayer[];
};
