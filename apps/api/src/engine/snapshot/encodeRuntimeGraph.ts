import type { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import type { RuntimeObjectDescriptor } from "#api/engine/snapshot/RuntimeObjectDescriptor";
import { RuntimeNumberValue } from "#api/engine/snapshot/RuntimeNumberValue";
import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import type { RuntimeCallbackDescriptor } from "#api/engine/snapshot/RuntimeCallbackDescriptor";
import type {
  RuntimeGraphNode,
  RuntimeGraphSnapshot,
  RuntimeGraphValue,
} from "#api/engine/snapshot/RuntimeGraphSnapshot";
import { RuntimeNodeKind } from "#api/engine/snapshot/RuntimeNodeKind";

type Params = {
  value: unknown;
  references?: RuntimeReferenceRegistry;
  describeCallback?: (callback: RuntimeCallback) => RuntimeCallbackDescriptor;
  describeObject?: (value: object) => RuntimeObjectDescriptor | undefined;
};

export function encodeRuntimeGraph({
  value,
  describeCallback,
  describeObject,
  references: externalReferences,
}: Params): RuntimeGraphSnapshot {
  const references = new Map<object, number>();
  const nodes: RuntimeGraphNode[] = [];
  const root = encode(value);
  return { version: 1, root, nodes };

  function encode(entry: unknown): RuntimeGraphValue {
    if (entry === undefined) {
      return { absent: true };
    }
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") {
      return entry;
    }
    if (typeof entry === "number") {
      if (Number.isNaN(entry)) {
        return { number: RuntimeNumberValue.NAN.value };
      }
      if (entry === Infinity) {
        return { number: RuntimeNumberValue.POSITIVE_INFINITY.value };
      }
      if (entry === -Infinity) {
        return { number: RuntimeNumberValue.NEGATIVE_INFINITY.value };
      }
      if (Object.is(entry, -0)) {
        return { number: RuntimeNumberValue.NEGATIVE_ZERO.value };
      }
      return entry;
    }
    if (typeof entry !== "object" && typeof entry !== "function") {
      throw new Error(`Unsupported runtime snapshot value: ${typeof entry}`);
    }
    const previous = references.get(entry);
    if (previous !== undefined) {
      return { reference: previous };
    }
    const reference = nodes.length;
    references.set(entry, reference);
    const placeholder: RuntimeGraphNode = { kind: RuntimeNodeKind.ARRAY.value, values: [] };
    nodes.push(placeholder);
    nodes[reference] = encodeNode(entry);
    return { reference };
  }

  function encodeNode(entry: object): RuntimeGraphNode {
    if (typeof entry !== "function") {
      const external = externalReferences?.describe(entry);
      if (external !== undefined) {
        return { kind: RuntimeNodeKind.REFERENCE.value, key: external.key, payload: encode(external.payload) };
      }
      const descriptor = describeObject?.(entry);
      if (descriptor !== undefined) {
        return { kind: RuntimeNodeKind.RESOURCE.value, key: descriptor.key, payload: encode(descriptor.payload) };
      }
    }
    if (Object.getOwnPropertySymbols(entry).length > 0) {
      throw new Error("Runtime snapshot contains an unsupported symbol");
    }
    if (typeof entry === "function") {
      if (Object.keys(entry).length > 0) {
        throw new Error("Runtime callback contains unsupported data properties");
      }
      if (describeCallback === undefined) {
        throw new Error("Runtime callback requires a snapshot descriptor");
      }
      const descriptor = describeCallback(entry as RuntimeCallback);
      return { kind: RuntimeNodeKind.CALLBACK.value, key: descriptor.key, payload: encode(descriptor.payload) };
    }
    if (Array.isArray(entry)) {
      if (
        Object.getPrototypeOf(entry) !== Array.prototype ||
        Object.getOwnPropertySymbols(entry).length > 0 ||
        Object.getOwnPropertyNames(entry).some(
          (key) => key !== "length" && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= entry.length),
        )
      ) {
        throw new Error("Runtime snapshot contains an unsupported array property or prototype");
      }
      const values = Array.from({ length: entry.length }, (_, index): RuntimeGraphValue => {
        if (!Object.hasOwn(entry, index)) {
          return { hole: true };
        }
        const descriptor = Object.getOwnPropertyDescriptor(entry, index)!;
        if (descriptor.get !== undefined || descriptor.set !== undefined) {
          throw new Error("Runtime snapshot cannot read array accessors");
        }
        return encode(descriptor.value);
      });
      return { kind: RuntimeNodeKind.ARRAY.value, values };
    }
    if (entry instanceof Map) {
      if (Object.getPrototypeOf(entry) !== Map.prototype || Object.getOwnPropertyNames(entry).length > 0) {
        throw new Error("Runtime snapshot contains an unsupported map property or prototype");
      }
      return {
        kind: RuntimeNodeKind.MAP.value,
        entries: Array.from(entry, ([key, mapped]) => [encode(key), encode(mapped)]),
      };
    }
    if (entry instanceof Set) {
      if (Object.getPrototypeOf(entry) !== Set.prototype || Object.getOwnPropertyNames(entry).length > 0) {
        throw new Error("Runtime snapshot contains an unsupported set property or prototype");
      }
      return { kind: RuntimeNodeKind.SET.value, values: Array.from(entry, encode) };
    }
    const prototype: unknown = Object.getPrototypeOf(entry);
    if ((prototype !== null && prototype !== Object.prototype) || Object.getOwnPropertySymbols(entry).length > 0) {
      throw new Error("Runtime snapshot contains an unsupported object prototype or symbol");
    }
    const entries: [string, RuntimeGraphValue][] = [];
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(entry))) {
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new Error("Runtime snapshot cannot read object accessors");
      }
      entries.push([key, encode(descriptor.value)]);
    }
    return { kind: RuntimeNodeKind.OBJECT.value, nullPrototype: prototype === null, entries };
  }
}
