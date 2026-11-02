import { createHash, createHmac } from "node:crypto";
import { RandomAlgorithm } from "#api/engine/random/RandomAlgorithm";
import type { RandomSnapshot } from "#api/engine/random/RandomSnapshot";

type Params = { seed: number; randomKey?: string };
type RestoreParams = { snapshot: RandomSnapshot; randomKey?: string };

export class SeededRandom {
  #state: number;
  #counter = 0;
  #seed: number;
  #randomKey: string | undefined;

  constructor({ seed, randomKey }: Params) {
    this.#seed = seed;
    this.#state = seed >>> 0;
    this.#randomKey = randomKey;
  }

  next(): number {
    if (this.#randomKey !== undefined) {
      if (!Number.isSafeInteger(this.#counter + 1)) {
        throw new Error("Random stream counter exhausted");
      }
      const digest = createHmac("sha256", this.#randomKey)
        .update(`shuffle:${this.#seed}:${this.#counter++}`)
        .digest();
      return digest.readUInt32BE(0) / 0x100000000;
    }
    this.#state = (this.#state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.#state ^ (this.#state >>> 15), 1 | this.#state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  snapshot(): RandomSnapshot {
    if (this.#randomKey !== undefined) {
      return {
        algorithm: RandomAlgorithm.HMAC_SHA256.value,
        seed: this.#seed,
        counter: this.#counter,
        keyFingerprint: createHash("sha256").update(this.#randomKey).digest("hex"),
      };
    }
    return { algorithm: RandomAlgorithm.MULBERRY32.value, state: this.#state >>> 0 };
  }

  static restore({ snapshot, randomKey }: RestoreParams): SeededRandom {
    if (snapshot.algorithm === RandomAlgorithm.MULBERRY32.value) {
      if (!Number.isInteger(snapshot.state) || snapshot.state < 0 || snapshot.state > 0xffffffff) {
        throw new Error("Invalid Mulberry32 state");
      }
      return new SeededRandom({ seed: snapshot.state });
    }
    if (
      snapshot.algorithm !== RandomAlgorithm.HMAC_SHA256.value ||
      !Number.isFinite(snapshot.seed) ||
      !Number.isSafeInteger(snapshot.counter) ||
      snapshot.counter < 0 ||
      randomKey === undefined ||
      createHash("sha256").update(randomKey).digest("hex") !== snapshot.keyFingerprint
    ) {
      throw new Error("Invalid keyed random snapshot or server key");
    }
    const restored = new SeededRandom({ seed: snapshot.seed, randomKey });
    restored.#counter = snapshot.counter;
    return restored;
  }
}
