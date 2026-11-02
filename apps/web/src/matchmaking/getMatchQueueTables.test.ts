import { describe, expect, it } from "vitest";
import { MatchQueue } from "@aegis/shared/matchmaking/MatchQueue";
import { getMatchQueueTables } from "@/matchmaking/getMatchQueueTables";

const casualTimed = {
  queue: MatchQueue.CASUAL.value,
  format: "standard",
  matchTimer: true,
  bestOf: 1,
  allowRollback: false,
} as const;

describe("match queue tables", () => {
  it("groups waiting players by queue settings with the longest wait, longest first", () => {
    const tables = getMatchQueueTables({
      counts: {
        buckets: [
          { ...casualTimed, searching: 3 },
          { ...casualTimed, bestOf: 3, searching: 1 },
        ],
        waiting: [
          { ...casualTimed, waitingSeconds: 20 },
          { ...casualTimed, waitingSeconds: 70 },
          { ...casualTimed, bestOf: 3, waitingSeconds: 90 },
        ],
      },
    });

    expect(
      tables.map(({ selection, searching, longestWaitSeconds }) => [selection.bestOf, searching, longestWaitSeconds]),
    ).toEqual([
      [3, 1, 90],
      [1, 3, 70],
    ]);
  });

  it("leaves ranked searchers out because a ranked opponent cannot be picked", () => {
    const tables = getMatchQueueTables({
      counts: { buckets: [{ ...casualTimed, queue: MatchQueue.RANKED.value, searching: 4 }], waiting: [] },
    });

    expect(tables).toEqual([]);
  });

  it("keeps a table without a wait time when its players fall outside the published list", () => {
    const tables = getMatchQueueTables({
      counts: {
        buckets: [
          { ...casualTimed, matchTimer: false, searching: 2 },
          { ...casualTimed, searching: 1 },
        ],
        waiting: [{ ...casualTimed, waitingSeconds: 5 }],
      },
    });

    expect(tables.map(({ searching, longestWaitSeconds }) => [searching, longestWaitSeconds])).toEqual([
      [1, 5],
      [2, undefined],
    ]);
  });
});
