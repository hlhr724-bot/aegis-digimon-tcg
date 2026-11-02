import { expect, it } from "vitest";
import { SubTriggerRegistry, type SubTriggerSubscription } from "#api/engine/effects/subtriggers";
import { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";

it("restores delayed bodies against the destination and retains timing deduplication and sequence", async () => {
  const originalCallbacks = new RuntimeCallbackRegistry();
  const restoredCallbacks = new RuntimeCallbackRegistry();
  const originalRuntime = { fired: 0 };
  const restoredRuntime = { fired: 0 };
  for (const [callbacks, runtime] of [
    [originalCallbacks, originalRuntime],
    [restoredCallbacks, restoredRuntime],
  ] as const) {
    callbacks.registerFactory({
      key: "run-delayed",
      create: () => async () => {
        runtime.fired++;
      },
    });
  }
  const run = originalCallbacks.create<SubTriggerSubscription["run"]>({ key: "run-delayed", payload: null });
  const original = new SubTriggerRegistry();
  const firstId = original.subscribe({
    event: "whenPlayed",
    once: false,
    oncePerTiming: true,
    description: "timing watcher",
    run,
  });
  expect(await original.fire("whenPlayed", () => undefined, undefined, "window-a")).toBe(1);
  const lastId = original.subscribe({ event: "whenPlayed", once: true, description: "delayed one-shot", run });
  const restored = new SubTriggerRegistry();
  restored.restore({
    snapshot: JSON.parse(JSON.stringify(original.snapshot({ callbacks: originalCallbacks }))),
    callbacks: restoredCallbacks,
  });
  expect(restored.subscriptionsFor("whenPlayed").map((entry) => entry.id)).toEqual([firstId, lastId]);
  expect(await restored.fire("whenPlayed", () => undefined, undefined, "window-a")).toBe(1);
  expect(restoredRuntime.fired).toBe(1);
  expect(restored.subscriptionsFor("whenPlayed").map((entry) => entry.id)).toEqual([firstId]);
  expect(await restored.fire("whenPlayed", () => undefined, undefined, "window-b")).toBe(1);
  expect(restoredRuntime.fired).toBe(2);
  expect(originalRuntime.fired).toBe(1);
  const nextRun = restoredCallbacks.create<SubTriggerSubscription["run"]>({ key: "run-delayed", payload: null });
  expect(restored.subscribe({ event: "whenPlayed", once: true, description: "next watcher", run: nextRun })).toBe(
    lastId + 1,
  );
});

it("refuses a snapshot or restore while an asynchronous delayed body is suspended", async () => {
  const registry = new SubTriggerRegistry();
  const empty = registry.snapshot();
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  registry.subscribe({ event: "whenPlayed", once: true, description: "waiting body", run: async () => waiting });
  const firing = registry.fire("whenPlayed", () => undefined);
  expect(() => registry.snapshot()).toThrow("resolution");
  expect(() => registry.restore({ snapshot: empty })).toThrow("resolution");
  release!();
  expect(await firing).toBe(1);
  expect(() => registry.snapshot()).not.toThrow();
});

it("leaves the destination registry untouched when decoding or validation fails", () => {
  const registry = new SubTriggerRegistry();
  const snapshot = registry.snapshot();
  expect(() => registry.restore({ snapshot: { version: 1, root: null, nodes: [] } })).toThrow("Invalid subtrigger");
  expect(registry.snapshot()).toEqual(snapshot);
  registry.subscribe({ event: "whenPlayed", once: true, description: "undescribed body", run: async () => {} });
  expect(() => registry.snapshot()).toThrow("descriptor");
});
