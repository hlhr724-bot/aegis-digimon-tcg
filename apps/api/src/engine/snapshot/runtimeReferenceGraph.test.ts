import { expect, it } from "vitest";
import { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

it("interns installed definitions while preserving map keys and aliases", () => {
  const original = { kind: "definition" };
  const destination = { kind: "definition" };
  const sourceRegistry = new RuntimeReferenceRegistry();
  const destinationRegistry = new RuntimeReferenceRegistry();
  for (const [references, value] of [
    [sourceRegistry, original],
    [destinationRegistry, destination],
  ] as const) {
    references.registerFactory({
      key: "definition",
      describe: (candidate) => (candidate === value ? "known" : undefined),
      resolve: (payload) => {
        if (payload !== "known") {
          throw new Error("Invalid reference");
        }
        return value;
      },
    });
  }
  const snapshot = encodeRuntimeGraph({
    value: { first: original, alias: original, answers: new Map([[original, false]]) },
    references: sourceRegistry,
  });
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    references: destinationRegistry,
  }) as { first: object; alias: object; answers: Map<object, boolean> };
  expect(restored.first).toBe(destination);
  expect(restored.alias).toBe(destination);
  expect(restored.answers.get(destination)).toBe(false);
  expect(() => decodeRuntimeGraph({ snapshot })).toThrow("registry is missing");
});

it("rejects recursive reference payloads rather than recursing indefinitely", () => {
  const value = {};
  const references = new RuntimeReferenceRegistry();
  references.registerFactory({
    key: "recursive",
    describe: (candidate) => (candidate === value ? value : undefined),
    resolve: () => value,
  });
  const snapshot = encodeRuntimeGraph({ value, references });
  expect(() => decodeRuntimeGraph({ snapshot, references })).toThrow("recursive");
});
