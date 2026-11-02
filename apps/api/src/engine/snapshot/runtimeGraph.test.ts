import { expect, it } from "vitest";
import { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

it("round-trips shared object identities, maps, sets, cycles and absent values through JSON", () => {
  const shared = { name: "shared" };
  const root = { array: [shared, undefined], map: new Map([[shared, new Set([shared])]]), self: undefined as unknown };
  root.self = root;
  const snapshot = encodeRuntimeGraph({ value: root });
  const restored = decodeRuntimeGraph({ snapshot: JSON.parse(JSON.stringify(snapshot)) }) as typeof root;
  expect(restored.self).toBe(restored);
  expect(restored.array[0]).not.toBe(shared);
  expect(restored.map.get(restored.array[0]!)).toEqual(new Set([restored.array[0]]));
  expect(restored.array[1]).toBeUndefined();
  expect(restored.array).toHaveLength(2);
});

it("preserves unusual numbers and null prototypes without executing accessors", () => {
  const value = Object.assign(Object.create(null), {
    absent: undefined,
    nan: NaN,
    positive: Infinity,
    negative: -Infinity,
    zero: -0,
  });
  const restored = decodeRuntimeGraph({ snapshot: JSON.parse(JSON.stringify(encodeRuntimeGraph({ value }))) });
  expect(Object.getPrototypeOf(restored)).toBeNull();
  expect(restored).toEqual(value);
  let accessed = false;
  const accessor = {
    get value() {
      accessed = true;
      return 1;
    },
  };
  expect(() => encodeRuntimeGraph({ value: accessor })).toThrow("accessors");
  expect(accessed).toBe(false);
});

it("recreates callbacks against the destination runtime and preserves shared callback identities", () => {
  const originalState = { amount: 2 };
  const restoredState = { amount: 7 };
  const original = new RuntimeCallbackRegistry();
  const restored = new RuntimeCallbackRegistry();
  for (const [registry, state] of [
    [original, originalState],
    [restored, restoredState],
  ] as const) {
    registry.registerFactory({
      key: "amount",
      create: (payload) => {
        if (typeof payload !== "number") {
          throw new Error("Invalid amount payload");
        }
        return () => state.amount * payload;
      },
    });
  }
  const callback = original.create<() => number>({ key: "amount", payload: 3 });
  const snapshot = encodeRuntimeGraph({
    value: { first: callback, second: callback },
    describeCallback: original.describe.bind(original),
  });
  const decoded = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    createCallback: restored.create.bind(restored),
  }) as { first: () => number; second: () => number };
  expect(callback()).toBe(6);
  expect(decoded.first()).toBe(21);
  expect(decoded.second).toBe(decoded.first);
  restoredState.amount = 8;
  expect(decoded.first()).toBe(24);
  expect(callback()).toBe(6);
});

it("refuses unregistered callbacks, missing factories and unsupported runtime objects", () => {
  const registry = new RuntimeCallbackRegistry();
  expect(() => encodeRuntimeGraph({ value: () => 1 })).toThrow("descriptor");
  expect(() => encodeRuntimeGraph({ value: () => 1, describeCallback: registry.describe.bind(registry) })).toThrow(
    "descriptor",
  );
  expect(() => registry.create({ key: "missing", payload: null })).toThrow("Unknown");
  expect(() => encodeRuntimeGraph({ value: new WeakMap() })).toThrow("prototype");
  expect(() => decodeRuntimeGraph({ snapshot: { version: 1, nodes: [], root: { reference: 0 } } })).toThrow("bounds");
});

it("distinguishes sparse array holes from explicit undefined entries", () => {
  const array = new Array<unknown>(3);
  array[1] = undefined;
  array[2] = array;
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(encodeRuntimeGraph({ value: array }))),
  }) as unknown[];
  expect(restored).toHaveLength(3);
  expect(Object.hasOwn(restored, 0)).toBe(false);
  expect(Object.hasOwn(restored, 1)).toBe(true);
  expect(restored[1]).toBeUndefined();
  expect(restored[2]).toBe(restored);
  Object.assign(array, { extra: true });
  expect(() => encodeRuntimeGraph({ value: array })).toThrow("array property");
});

it("refuses custom collection state and keeps literal prototype keys inert", () => {
  const map = Object.assign(new Map(), { ignoredState: 1 });
  const set = Object.assign(new Set(), { ignoredState: 1 });
  expect(() => encodeRuntimeGraph({ value: map })).toThrow("map property");
  expect(() => encodeRuntimeGraph({ value: set })).toThrow("set property");
  const object = Object.create(null) as Record<string, unknown>;
  object["__proto__"] = { captured: true };
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(encodeRuntimeGraph({ value: object }))),
  }) as Record<string, unknown>;
  expect(Object.getPrototypeOf(restored)).toBeNull();
  expect(restored["__proto__"]).toEqual({ captured: true });
  expect(Object.hasOwn({}, "captured")).toBe(false);
});
