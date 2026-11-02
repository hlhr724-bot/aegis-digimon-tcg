import { createHash } from "node:crypto";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";

type CardParams = { compiled: CompiledCard };

class Registry {
  #immutable = new WeakSet<CompiledCard>();
  #fingerprints = new WeakMap<CompiledCard, string>();

  markImmutable({ compiled }: CardParams): void {
    if (!Object.isFrozen(compiled)) {
      throw new Error("Compiled-card fingerprint caching requires an immutable root");
    }
    this.#immutable.add(compiled);
  }

  get({ compiled }: CardParams): string | undefined {
    if (!this.#immutable.has(compiled)) {
      return undefined;
    }
    const existing = this.#fingerprints.get(compiled);
    if (existing !== undefined) {
      return existing;
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(compiled)).digest("hex");
    this.#fingerprints.set(compiled, fingerprint);
    return fingerprint;
  }
}

export const registeredCompiledCardFingerprints = new Registry();
