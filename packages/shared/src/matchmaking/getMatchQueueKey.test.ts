import { describe, expect, it } from "vitest";
import { getMatchQueueKey } from "#shared/matchmaking/getMatchQueueKey";
import { MatchQueue } from "#shared/matchmaking/MatchQueue";

const casual = {
  queue: MatchQueue.CASUAL.value,
  format: "standard",
  matchTimer: true,
  bestOf: 1,
  allowRollback: false,
} as const;

describe("match queue identity", () => {
  it("separates casual queues by every room filter", () => {
    const keys = new Set([
      getMatchQueueKey(casual),
      getMatchQueueKey({ ...casual, matchTimer: false }),
      getMatchQueueKey({ ...casual, bestOf: 3 }),
      getMatchQueueKey({ ...casual, allowRollback: true }),
      getMatchQueueKey({ ...casual, format: "pauper" }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("groups ranked and manual queues by format only", () => {
    for (const queue of [MatchQueue.RANKED.value, MatchQueue.MANUAL.value]) {
      expect(getMatchQueueKey({ ...casual, queue })).toBe(
        getMatchQueueKey({ ...casual, queue, matchTimer: false, bestOf: 3, allowRollback: true }),
      );
      expect(getMatchQueueKey({ ...casual, queue })).not.toBe(getMatchQueueKey({ ...casual, queue, format: "pauper" }));
    }
  });
});
