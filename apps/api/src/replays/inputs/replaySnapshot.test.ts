import { expect, it } from "vitest";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { extractReplay } from "#api/replays/inputs/extract";
import { recordRoomMatch } from "#api/replays/inputs/roomMatch.fixture";
import { replayPositions } from "#api/bot/evolution/replayPositions";
import { runReplay } from "#api/replays/inputs/run";

it.each([
  { seed: 20260914, fraction: 0 },
  { seed: 20260914, fraction: 0.5 },
  { seed: 20260914, fraction: 0.9 },
  { seed: 20260915, fraction: 0 },
  { seed: 20260915, fraction: 0.5 },
  { seed: 20260915, fraction: 0.9 },
])(
  "restores the complete recorded suffix with identical batches and state for seed $seed at $fraction",
  async ({ seed, fraction }) => {
    const recorded = await recordRoomMatch({ seed });
    const record = extractReplay(recorded.lines, recorded.matchId);
    const positions = await replayPositions(record);
    expect(positions.positions.length).toBeGreaterThan(0);
    const inputIndex = positions.positions[Math.floor(fraction * positions.positions.length)]!.inputIndex;
    const prefix = await runReplay(record, { untilInput: inputIndex, stopOnDivergence: true });
    expect(prefix.divergences).toEqual([]);
    const snapshot = JSON.parse(JSON.stringify(prefix.getSnapshot()));
    const expectedEvents: SequencedServerEvent[] = [];
    const actualEvents: SequencedServerEvent[] = [];
    const expected = await runReplay(record, {
      stopOnDivergence: true,
      onBatch: (_state, events) => {
        expectedEvents.push(...structuredClone(events));
      },
    });
    const actual = await runReplay(record, {
      snapshot,
      stopOnDivergence: true,
      onBatch: (_state, events) => {
        actualEvents.push(...structuredClone(events));
      },
    });
    expect(expected.divergences).toEqual([]);
    expect(actual.divergences).toEqual([]);
    expect(actual.applied).toBe(record.inputs.length);
    expect(actual.engineEvents).toBe(expected.engineEvents);
    expect(actualEvents).toEqual(expectedEvents.filter((event) => event.seq > snapshot.eventSequence));
    expect(actual.state.toJSON()).toEqual(expected.state.toJSON());
  },
  60000,
);
