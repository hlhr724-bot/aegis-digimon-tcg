import { beforeAll, describe, expect, it } from "vitest";
import { extractReplay } from "#api/replays/inputs/extract";
import { recordRoomMatch } from "#api/replays/inputs/roomMatch.fixture";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { replayPositions } from "#api/bot/evolution/replayPositions";
import { runReplay } from "#api/replays/inputs/run";
import { getReplaySearchWindow } from "#api/bot/evolution/getReplaySearchWindow";
import { informationKey } from "#api/bot/evolution/mcts";
import { chooseHeuristic, SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { runReplayTeacher } from "#api/bot/evolution/runReplayTeacher";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";

let record: ReplayRecord;
let inputIndex: number;
let seat: 0 | 1;
let expectedInformation: string;

beforeAll(async () => {
  const recorded = await recordRoomMatch({ seed: 20260914 });
  record = extractReplay(recorded.lines, recorded.matchId);
  const positions = await replayPositions(record);
  const position = positions.positions[0]!;
  inputIndex = position.inputIndex;
  seat = position.seat;
  const restored = await runReplay(record, { untilInput: inputIndex, stopOnDivergence: true });
  expectedInformation = informationKey(getReplaySearchWindow({ engine: restored.engine, seat }));
});

describe("replay continuations", () => {
  it("rejects a changed visible root before choosing an action", async () => {
    await expect(
      runReplayContinuation({
        record,
        inputIndex,
        seat,
        expectedInformation: "changed",
        sampleSeed: 42,
        program: SEED_HEURISTIC,
        choose: () => {
          throw new Error("Must not choose");
        },
      }),
    ).rejects.toThrow("root observation");
  });

  it("rejects a divergent prefix before choosing an action", async () => {
    const changed = structuredClone(record);
    changed.inputs[0]!.stateVersion += 1;
    await expect(
      runReplayContinuation({
        record: changed,
        inputIndex,
        seat,
        expectedInformation,
        sampleSeed: 42,
        program: SEED_HEURISTIC,
        choose: () => 0,
      }),
    ).rejects.toThrow("prefix diverged");
  });

  it("continues a sampled root without reading the recorded future", async () => {
    const truncated = { ...record, inputs: record.inputs.slice(0, inputIndex + 1) };
    const choose = (window: Parameters<typeof chooseHeuristic>[1]) => chooseHeuristic(SEED_HEURISTIC, window, 42);
    const first = await runReplayContinuation({
      record,
      inputIndex,
      seat,
      expectedInformation,
      sampleSeed: 42,
      program: SEED_HEURISTIC,
      choose,
    });
    const second = await runReplayContinuation({
      record: truncated,
      inputIndex,
      seat,
      expectedInformation,
      sampleSeed: 42,
      program: SEED_HEURISTIC,
      choose,
    });
    expect(first.valid).toBe(true);
    expect(second).toMatchObject({
      valid: first.valid,
      reward: first.reward,
      reason: first.reason,
      turn: first.turn,
      failures: [],
    });
  }, 60000);

  it("produces a bounded search report containing only the acting seat hand", async () => {
    const result = await runReplayTeacher({
      record,
      inputIndex,
      seat,
      expectedInformation,
      program: SEED_HEURISTIC,
      seed: 42,
    });
    expect(result.search.completed).toBe(32);
    expect(result.context.observation.players.find((player) => player.seat !== seat)!.hand).toEqual([]);
    expect(result.context.actions.length).toBeGreaterThan(1);
    expect(result.alternative).not.toBe(result.baseline);
  }, 60000);

  it("never scores an exhausted continuation as a draw", async () => {
    const result = await runReplayContinuation({
      record,
      inputIndex,
      seat,
      expectedInformation,
      sampleSeed: 42,
      program: SEED_HEURISTIC,
      maxDurationMs: 0.001,
      choose: () => 0,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("continuationLimit");
  });
});
