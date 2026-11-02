import { expect, it } from "vitest";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

class Counter {
  count = 0;
  peer: Counter | undefined;

  increment(): void {
    this.count++;
  }
}

function createRegistry(): RuntimeObjectRegistry {
  const registry = new RuntimeObjectRegistry();
  registry.registerFactory({
    key: "counter",
    allocate: () => new Counter(),
    describe: (value) => {
      const counter = value as Counter;
      return { count: counter.count, peer: counter.peer };
    },
    hydrate: ({ value, payload }) => {
      if (
        payload === null ||
        typeof payload !== "object" ||
        !("count" in payload) ||
        typeof payload.count !== "number"
      ) {
        throw new Error("Invalid counter state");
      }
      const counter = value as Counter;
      counter.count = payload.count;
      counter.peer = "peer" in payload ? (payload.peer as Counter | undefined) : undefined;
    },
  });
  return registry;
}

it("restores custom object prototypes, aliases and mutually recursive resources", () => {
  const original = createRegistry();
  const destination = createRegistry();
  const first = new Counter();
  const second = new Counter();
  first.count = 3;
  first.peer = second;
  second.peer = first;
  original.track({ value: first, key: "counter" });
  original.track({ value: second, key: "counter" });
  const snapshot = encodeRuntimeGraph({
    value: [first, second, first],
    describeObject: original.describe.bind(original),
  });
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    objects: destination,
  }) as Counter[];
  expect(restored[0]).toBeInstanceOf(Counter);
  expect(restored[0]).toBe(restored[2]);
  expect(restored[0]!.peer).toBe(restored[1]);
  expect(restored[1]!.peer).toBe(restored[0]);
  restored[0]!.increment();
  expect(restored[0]!.count).toBe(4);
  expect(first.count).toBe(3);
  expect(() =>
    encodeRuntimeGraph({ value: restored, describeObject: destination.describe.bind(destination) }),
  ).not.toThrow();
});

it("rejects missing registries, missing factories and reused allocation objects", () => {
  const registry = createRegistry();
  const counter = new Counter();
  registry.track({ value: counter, key: "counter" });
  const snapshot = encodeRuntimeGraph({ value: counter, describeObject: registry.describe.bind(registry) });
  expect(() => decodeRuntimeGraph({ snapshot })).toThrow("registry is missing");
  expect(() => decodeRuntimeGraph({ snapshot, objects: new RuntimeObjectRegistry() })).toThrow("Unknown");
  registry.registerFactory({ key: "reused", allocate: () => counter, describe: () => null, hydrate: () => {} });
  expect(() => registry.allocate("reused")).toThrow("reused");
});
