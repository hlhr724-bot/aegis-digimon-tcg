import { MatchQueue } from "#shared/matchmaking/MatchQueue";
import type { MatchQueueSelection } from "#shared/matchmaking/MatchQueueSelection";

export function getMatchQueueKey({ queue, format, matchTimer, bestOf, allowRollback }: MatchQueueSelection): string {
  const entry = Object.values(MatchQueue).find((candidate) => candidate.value === queue);
  if (!entry?.splitsByMatchSettings) {
    return [queue, format].join("|");
  }
  return [queue, format, matchTimer ? "timer" : "untimed", `bo${bestOf}`, allowRollback ? "rollback" : "final"].join(
    "|",
  );
}
