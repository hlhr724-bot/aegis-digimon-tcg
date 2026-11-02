import { expect, it } from "vitest";
import { UseTracker } from "#api/engine/effects/kernel";

it("restores effect, watcher and link-cost use identities without sharing mutable state", () => {
  const original = new UseTracker();
  original.register("card-a", "effect");
  original.register("card-a", "effect");
  original.register("card-a/watcher", "subtrigger");
  original.register("link-cost/card-a/linked", "reducer");
  original.register("card-b", "effect");
  const snapshot = original.snapshot();
  const restored = new UseTracker();
  restored.register("unrelated", "effect");
  restored.restore(JSON.parse(JSON.stringify(snapshot)));
  expect(restored.count("card-a", "effect")).toBe(2);
  expect(restored.count("card-a/watcher", "subtrigger")).toBe(1);
  expect(restored.count("link-cost/card-a/linked", "reducer")).toBe(1);
  expect(restored.count("unrelated", "effect")).toBe(0);
  restored.unregister("card-a", "effect");
  expect(restored.count("card-a", "effect")).toBe(1);
  expect(original.count("card-a", "effect")).toBe(2);
  restored.forgetInstance("card-a");
  expect(restored.count("card-a", "effect")).toBe(0);
  expect(restored.count("card-a/watcher", "subtrigger")).toBe(0);
  expect(restored.count("link-cost/card-a/linked", "reducer")).toBe(0);
  expect(restored.count("card-b", "effect")).toBe(1);
  expect(original.snapshot()).toEqual(snapshot);
  restored.resetForNewTurn();
  expect(restored.snapshot()).toEqual([]);
});

it("rejects invalid usage snapshots atomically", () => {
  const tracker = new UseTracker();
  tracker.register("existing", "effect");
  const snapshot = tracker.snapshot();
  for (const count of [0, -1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => tracker.restore([["card\0effect", count]])).toThrow("Invalid effect usage snapshot");
    expect(tracker.snapshot()).toEqual(snapshot);
  }
  expect(() => tracker.restore([["missing-separator", 1]])).toThrow("Invalid effect usage snapshot");
  expect(() =>
    tracker.restore([
      ["card\0effect", 1],
      ["card\0effect", 2],
    ]),
  ).toThrow("Invalid effect usage snapshot");
  expect(tracker.snapshot()).toEqual(snapshot);
});
