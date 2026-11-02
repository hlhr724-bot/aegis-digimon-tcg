import { expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { MemoryGauge } from "#api/engine/MemoryGauge";

it("restores both seat thresholds without replacing destination state or policy hooks", () => {
  const originalState = new GameState();
  const destinationState = new GameState();
  const original = new MemoryGauge(originalState);
  const destination = new MemoryGauge(
    destinationState,
    () => {},
    () => false,
  );
  original.setTurnEndMinMemory(0, 3);
  original.setTurnEndMinMemory(1, 4);
  destination.setTurnEndMinMemory(0, 7);
  destination.restore(JSON.parse(JSON.stringify(original.snapshot())));
  expect(destination.turnEndMinMemoryFor(0)).toBe(3);
  expect(destination.turnEndMinMemoryFor(1)).toBe(4);
  destinationState.memory = -2;
  expect(destination.hasCrossedToOpponent()).toBe(false);
  destinationState.memory = -3;
  expect(destination.hasCrossedToOpponent()).toBe(true);
  destination.addMemoryForSeat(0, 2, "effect");
  expect(destinationState.memory).toBe(-3);
  expect(originalState.memory).toBe(0);
  destination.clearTurnEndMinMemoryOverrides();
  expect(original.turnEndMinMemoryFor(0)).toBe(3);
});

it("rejects active staging and invalid entries without partially changing live thresholds", () => {
  const gauge = new MemoryGauge(new GameState());
  gauge.setTurnEndMinMemory(0, 3);
  const snapshot = gauge.snapshot();
  gauge.beginTurnEndMinMemoryRecompute();
  expect(() => gauge.snapshot()).toThrow("staged");
  expect(() => gauge.restore(snapshot)).toThrow("staged");
  gauge.commitTurnEndMinMemoryRecompute();
  gauge.restore(snapshot);
  expect(() =>
    gauge.restore({
      version: 1,
      turnEndMinMemoryOverrides: [
        [0, 4],
        [0, 5],
      ],
    }),
  ).toThrow("duplicate");
  expect(gauge.turnEndMinMemoryFor(0)).toBe(3);
  expect(() => gauge.restore({ version: 1, turnEndMinMemoryOverrides: [[1, NaN]] })).toThrow("Invalid");
  expect(gauge.turnEndMinMemoryFor(0)).toBe(3);
  const detached = gauge.snapshot();
  gauge.setTurnEndMinMemory(0, 8);
  expect(detached.turnEndMinMemoryOverrides).toEqual([[0, 3]]);
});
