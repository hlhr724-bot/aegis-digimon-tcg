import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RandomAlgorithm } from "#api/engine/random/RandomAlgorithm";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { makeRng } from "#api/engine/setup";

function legacyRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe("serializable seeded random streams", () => {
  it.each([0, 1, -1, 0xffffffff, 123456789])("preserves legacy Mulberry32 at seed %s", (seed) => {
    const random = makeRng(seed);
    const legacy = legacyRandom(seed);
    for (let index = 0; index < 10000; index++) {
      expect(random()).toBe(legacy());
    }
  });

  it.each([undefined, "37".repeat(32)])("restores an independent stream with key %s", (randomKey) => {
    const random = new SeededRandom({ seed: 123, randomKey });
    for (let index = 0; index < 777; index++) {
      random.next();
    }
    const snapshot = JSON.parse(JSON.stringify(random.snapshot()));
    const restored = SeededRandom.restore({ snapshot, randomKey });
    for (let index = 0; index < 1000; index++) {
      expect(restored.next()).toBe(random.next());
    }
    const detached = random.snapshot();
    random.next();
    expect(detached).not.toEqual(random.snapshot());
    if (randomKey !== undefined) {
      expect(JSON.stringify(snapshot)).not.toContain(randomKey);
      expect(JSON.stringify(random)).not.toContain(randomKey);
    }
  });

  it("preserves the exact keyed shuffle sequence", () => {
    const randomKey = "secret-test-key";
    const random = makeRng(-123, randomKey);
    for (let counter = 0; counter < 1000; counter++) {
      const expected = createHmac("sha256", randomKey).update(`shuffle:-123:${counter}`).digest().readUInt32BE(0);
      expect(random()).toBe(expected / 0x100000000);
    }
  });

  it("rejects missing or mismatched keys and invalid state", () => {
    const snapshot = new SeededRandom({ seed: 1, randomKey: "original-key" }).snapshot();
    expect(() => SeededRandom.restore({ snapshot })).toThrow("server key");
    expect(() => SeededRandom.restore({ snapshot, randomKey: "wrong-key" })).toThrow("server key");
    for (const state of [-1, 0x100000000, 0.5, NaN]) {
      expect(() =>
        SeededRandom.restore({ snapshot: { algorithm: RandomAlgorithm.MULBERRY32.value, state } }),
      ).toThrow();
    }
  });
});
