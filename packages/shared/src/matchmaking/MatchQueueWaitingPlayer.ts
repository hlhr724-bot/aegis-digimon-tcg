import type { MatchQueueSelection } from "#shared/matchmaking/MatchQueueSelection";

export const MATCH_QUEUE_WAITING_LIMIT = 20;

export type MatchQueueWaitingPlayer = MatchQueueSelection & {
  waitingSeconds: number;
};
