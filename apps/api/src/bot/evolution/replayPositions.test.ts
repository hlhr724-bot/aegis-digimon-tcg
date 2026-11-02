import { beforeAll, describe, expect, it } from "vitest";
import { extractReplay } from "#api/replays/inputs/extract";
import { recordRoomMatch } from "#api/replays/inputs/roomMatch.fixture";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { replayPositions } from "#api/bot/evolution/replayPositions";

let record: ReplayRecord;

beforeAll(async () => {
  const recorded = await recordRoomMatch({ seed: 20260914 });
  record = extractReplay(recorded.lines, recorded.matchId);
});

describe("replay positions", () => {
  it("labels each recorded main action against the legal actions of its settled window", async () => {
    const advised: number[] = [];
    const result = await replayPositions(record, {
      first: () => 0,
      recorded: (_engine, seat, window) => {
        advised.push(seat);
        return window.actions.length - 1;
      },
    });
    expect(result.firstDivergence).toBeNull();
    expect(result.positions.length).toBeGreaterThan(0);
    expect(advised).toHaveLength(result.positions.length);
    for (const position of result.positions) {
      expect(position.window.kind).toBe("main");
      expect(position.window.observation.seat).toBe(position.seat);
      expect(position.chosen === null || position.window.actions[position.chosen] !== undefined).toBe(true);
      expect(position.advice).toEqual({ first: 0, recorded: position.window.actions.length - 1 });
    }
    expect(result.positions.filter((position) => position.chosen !== null).length).toBeGreaterThan(0);
  });

  it("drops positions after the first divergence", async () => {
    const tampered = structuredClone(record);
    const index = tampered.inputs.findIndex(
      (input) => input.kind === "intent" && input.ok === true && input.intent.type === "playCard",
    );
    const input = tampered.inputs[index]!;
    if (input.kind !== "intent" || input.intent.type !== "playCard") throw new Error("Fixture lacks a played card");
    input.intent.instanceId = "no-such-card";
    const result = await replayPositions(tampered);
    expect(result.firstDivergence).toBe(index);
    expect(result.positions.every((position) => position.inputIndex < index)).toBe(true);
  });
});
