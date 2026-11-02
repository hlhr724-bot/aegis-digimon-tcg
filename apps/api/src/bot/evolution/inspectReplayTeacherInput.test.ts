import { beforeAll, describe, expect, it } from "vitest";
import { extractReplay } from "#api/replays/inputs/extract";
import { recordRoomMatch } from "#api/replays/inputs/roomMatch.fixture";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { runReplay } from "#api/replays/inputs/run";
import { SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { inspectReplayTeacherInput } from "#api/bot/evolution/inspectReplayTeacherInput";

let record: ReplayRecord;
let expected: { winnerSeat: number | null; reason: string; turn: number };

beforeAll(async () => {
  const recorded = await recordRoomMatch({ seed: 20260914 });
  record = extractReplay(recorded.lines, recorded.matchId);
  await runReplay(record, {
    onBatch: (state, events) => {
      for (const event of events) {
        if (event.kind === "gameOver") {
          expected = {
            winnerSeat: event.result.outcome === "draw" ? null : event.result.winnerSeat,
            reason: event.reason,
            turn: state.turnCount,
          };
        }
      }
    },
  });
});

describe("replay teacher inspection", () => {
  it("reproduces a complete human and bot replay including breeding transitions", async () => {
    const result = await inspectReplayTeacherInput({ record, expected, program: SEED_HEURISTIC });
    expect(result.terminal).toEqual(expected);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.positions.every((position) => record.seats[position.seat].bot !== true)).toBe(true);
  });

  it("quarantines a replay whose recorded terminal evidence disagrees", async () => {
    await expect(
      inspectReplayTeacherInput({
        record,
        expected: { ...expected, turn: expected.turn + 1 },
        program: SEED_HEURISTIC,
      }),
    ).rejects.toThrow("recorded terminal");
  });
});
