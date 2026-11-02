import type { RuntimeGraphDecodeParams } from "#api/engine/snapshot/RuntimeGraphDecodeParams";
import type { RuntimeGraphPorts } from "#api/engine/snapshot/RuntimeGraphPorts";
import type { RuntimeGraphSnapshot, RuntimeGraphValue } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import { RuntimeNumberValue } from "#api/engine/snapshot/RuntimeNumberValue";
import { RuntimeNodeKind } from "#api/engine/snapshot/RuntimeNodeKind";

type FieldParams = { key: string };

export class RuntimeGraphDecoder {
  readonly #snapshot: RuntimeGraphSnapshot;
  #ports: RuntimeGraphPorts;
  #values = new Map<number, unknown>();
  #callbacksInProgress = new Set<number>();
  #referencesInProgress = new Set<number>();
  #failed = false;
  #decoding = false;
  #portsBound = false;
  #runtimeDecoded = false;

  constructor({ snapshot, createCallback, objects, references }: RuntimeGraphDecodeParams) {
    if (snapshot.version !== 1 || !Array.isArray(snapshot.nodes)) {
      throw new Error("Unsupported runtime graph snapshot");
    }
    this.#snapshot = snapshot;
    this.#ports = { createCallback, objects, references };
    references?.beginDecode();
  }

  decodeRoot(): unknown {
    return this.#run(() => this.#decode(this.#snapshot.root));
  }

  decodeRootField({ key }: FieldParams): unknown {
    return this.#run(() => {
      const root = this.#snapshot.root;
      if (root === null || typeof root !== "object" || !("reference" in root)) {
        throw new Error("Runtime graph root is not an object record");
      }
      const node = this.#snapshot.nodes[root.reference];
      if (node?.kind !== RuntimeNodeKind.OBJECT.value) {
        throw new Error("Runtime graph root is not an object record");
      }
      const matches = node.entries.filter(([name]) => name === key);
      if (matches.length !== 1) {
        throw new Error("Runtime graph field is missing or duplicated");
      }
      return this.#decode(matches[0]![1]);
    });
  }

  bindRuntimePorts(ports: RuntimeGraphPorts): void {
    if (this.#failed || this.#decoding || this.#portsBound || this.#runtimeDecoded) {
      throw new Error("Runtime graph ports cannot be rebound in this decoder state");
    }
    this.#ports = { ...ports };
    this.#portsBound = true;
    this.#ports.references?.beginDecode();
  }

  #run(decode: () => unknown): unknown {
    if (this.#failed || this.#decoding) {
      throw new Error("Runtime graph decoder is failed or already decoding");
    }
    this.#decoding = true;
    try {
      return decode();
    } catch (error) {
      this.#failed = true;
      throw error;
    } finally {
      this.#decoding = false;
    }
  }

  #decode(value: RuntimeGraphValue): unknown {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "object" || value === null) {
      throw new Error("Invalid runtime graph value");
    }
    if ("number" in value) {
      switch (value.number) {
        case RuntimeNumberValue.NAN.value:
          return NaN;
        case RuntimeNumberValue.POSITIVE_INFINITY.value:
          return Infinity;
        case RuntimeNumberValue.NEGATIVE_INFINITY.value:
          return -Infinity;
        case RuntimeNumberValue.NEGATIVE_ZERO.value:
          return -0;
        default:
          throw new Error("Invalid runtime graph numeric value");
      }
    }
    if ("absent" in value && value.absent === true) {
      return undefined;
    }
    if (!("reference" in value) || !Number.isSafeInteger(value.reference) || value.reference < 0) {
      throw new Error("Invalid runtime graph reference");
    }
    const index = value.reference;
    if (this.#values.has(index)) {
      return this.#values.get(index);
    }
    const node = this.#snapshot.nodes[index];
    if (node === undefined) {
      throw new Error("Runtime graph reference is out of bounds");
    }
    if (node.kind === RuntimeNodeKind.REFERENCE.value) {
      this.#runtimeDecoded = true;
      if (this.#ports.references === undefined) {
        throw new Error("Runtime reference registry is missing");
      }
      if (this.#referencesInProgress.has(index)) {
        throw new Error("Runtime reference payload is recursive");
      }
      this.#referencesInProgress.add(index);
      const object = this.#ports.references.resolve({ key: node.key, payload: this.#decode(node.payload) });
      this.#referencesInProgress.delete(index);
      this.#values.set(index, object);
      return object;
    }
    if (node.kind === RuntimeNodeKind.RESOURCE.value) {
      if (this.#ports.objects === undefined) {
        throw new Error("Runtime object registry is missing");
      }
      const object = this.#ports.objects.allocate(node.key);
      this.#values.set(index, object);
      this.#ports.objects.hydrate({ value: object, key: node.key, payload: this.#decode(node.payload) });
      return object;
    }
    if (node.kind === RuntimeNodeKind.CALLBACK.value) {
      this.#runtimeDecoded = true;
      if (this.#ports.createCallback === undefined || this.#callbacksInProgress.has(index)) {
        throw new Error("Runtime callback factory is missing or its payload is recursive");
      }
      this.#callbacksInProgress.add(index);
      const callback = this.#ports.createCallback({ key: node.key, payload: this.#decode(node.payload) });
      this.#callbacksInProgress.delete(index);
      this.#values.set(index, callback);
      return callback;
    }
    if (node.kind === RuntimeNodeKind.ARRAY.value) {
      const array: unknown[] = [];
      this.#values.set(index, array);
      for (const entry of node.values) {
        if (entry !== null && typeof entry === "object" && "hole" in entry && entry.hole === true) {
          array.length++;
        } else {
          array.push(this.#decode(entry));
        }
      }
      return array;
    }
    if (node.kind === RuntimeNodeKind.MAP.value) {
      const map = new Map<unknown, unknown>();
      this.#values.set(index, map);
      for (const [key, mapped] of node.entries) {
        map.set(this.#decode(key), this.#decode(mapped));
      }
      return map;
    }
    if (node.kind === RuntimeNodeKind.SET.value) {
      const set = new Set<unknown>();
      this.#values.set(index, set);
      for (const entry of node.values) {
        set.add(this.#decode(entry));
      }
      return set;
    }
    if (node.kind !== RuntimeNodeKind.OBJECT.value) {
      throw new Error("Invalid runtime graph node kind");
    }
    const object = Object.create(node.nullPrototype ? null : Object.prototype) as Record<string, unknown>;
    this.#values.set(index, object);
    for (const [key, entry] of node.entries) {
      Object.defineProperty(object, key, {
        value: this.#decode(entry),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    return object;
  }
}
