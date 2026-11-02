import { createHash } from "node:crypto";
import type { CompiledNodeReference } from "#api/engine/effects/interpreter/snapshot/CompiledNodeReference";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";

type RootEntry = { root: object; indexed: boolean; fingerprint?: string };
type RegisterParams = { cardId: string; rootKey: string; root: object; index?: boolean };
type IndexParams = { cardId: string; rootKey: string; entry: RootEntry };
type MaterializerParams = { cardId: string; materialize: (rootKey: string) => void };

export class CompiledNodeRegistry {
  #roots = new Map<string, Map<string, RootEntry>>();
  #nodes = new WeakMap<object, CompiledNodeReference>();
  #materializers = new Map<string, MaterializerParams["materialize"]>();
  #validated = new WeakMap<RootEntry, string>();

  resetCard(cardId: string): void {
    this.#roots.set(cardId, new Map());
    this.#materializers.delete(cardId);
  }

  setMaterializer({ cardId, materialize }: MaterializerParams): void {
    this.#materializers.set(cardId, materialize);
  }

  registerRoot({ cardId, rootKey, root, index = false }: RegisterParams): void {
    const roots = this.#roots.get(cardId) ?? new Map<string, RootEntry>();
    this.#roots.set(cardId, roots);
    const previous = roots.get(rootKey);
    if (previous?.root === root) {
      if (index && !previous.indexed) {
        this.indexRoot({ cardId, rootKey, entry: previous });
      }
      return;
    }
    const entry: RootEntry = { root, indexed: false };
    roots.set(rootKey, entry);
    if (index) {
      this.indexRoot({ cardId, rootKey, entry });
    }
  }

  describe(value: object): CompiledNodeReference | undefined {
    const reference = this.#nodes.get(value);
    if (reference === undefined) {
      return undefined;
    }
    const entry = this.getRoot(reference);
    const fingerprint = entry.fingerprint ?? getFingerprint(entry.root);
    if (fingerprint !== reference.fingerprint) {
      throw new Error(`Compiled node belongs to a replaced IR root: ${reference.cardId}/${reference.rootKey}`);
    }
    return { ...reference, path: [...reference.path] };
  }

  beginDecode(): void {
    this.#validated = new WeakMap();
  }

  resolve(reference: CompiledNodeReference): object {
    const entry = this.getRoot(reference);
    let fingerprint = this.#validated.get(entry);
    if (fingerprint === undefined) {
      fingerprint = getFingerprint(entry.root);
      this.#validated.set(entry, fingerprint);
    }
    if (fingerprint !== reference.fingerprint) {
      throw new Error(`Compiled node rules fingerprint mismatch: ${reference.cardId}/${reference.rootKey}`);
    }
    let value: unknown = entry.root;
    for (const key of reference.path) {
      if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) {
        throw new Error("Compiled node path does not exist");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new Error("Compiled node path contains an accessor");
      }
      value = descriptor.value;
    }
    if (value === null || typeof value !== "object") {
      throw new Error("Compiled node path does not identify an object");
    }
    return value;
  }

  private getRoot(reference: Pick<CompiledNodeReference, "cardId" | "rootKey">): RootEntry {
    let entry = this.#roots.get(reference.cardId)?.get(reference.rootKey);
    if (entry === undefined) {
      this.#materializers.get(reference.cardId)?.(reference.rootKey);
      entry = this.#roots.get(reference.cardId)?.get(reference.rootKey);
    }
    if (entry === undefined) {
      throw new Error(`Compiled node root is not registered: ${reference.cardId}/${reference.rootKey}`);
    }
    return entry;
  }

  private indexRoot({ cardId, rootKey, entry }: IndexParams): void {
    const fingerprint = getFingerprint(entry.root);
    entry.fingerprint = fingerprint;
    entry.indexed = true;
    const seen = new Set<object>();
    const visit = (value: unknown, path: (string | number)[]): void => {
      if (value === null || typeof value !== "object" || seen.has(value)) {
        return;
      }
      seen.add(value);
      this.#nodes.set(value, { cardId, rootKey, fingerprint, path });
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (Array.isArray(value) && key === "length") {
          continue;
        }
        if (descriptor.get !== undefined || descriptor.set !== undefined) {
          throw new Error("Compiled IR contains an accessor");
        }
        visit(descriptor.value, [...path, Array.isArray(value) ? Number(key) : key]);
      }
    };
    visit(entry.root, []);
  }
}

function getFingerprint(root: object): string {
  return createHash("sha256")
    .update(JSON.stringify(encodeRuntimeGraph({ value: root })))
    .digest("hex");
}
