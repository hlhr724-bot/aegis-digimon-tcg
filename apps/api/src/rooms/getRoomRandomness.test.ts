import { afterEach, describe, expect, it, vi } from "vitest";
import { getRoomRandomness } from "#api/rooms/getRoomRandomness";

vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomBytes: (size: number) => Buffer.alloc(size, 42),
}));

afterEach(() => vi.unstubAllEnvs());

describe("room randomness authority", () => {
  it.each(["production", "development"])("ignores a caller seed in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const result = getRoomRandomness({ seed: 123 });
    expect(result.seed).toBe(0x2a2a2a2a);
    expect(result.randomKey).toBe("2a".repeat(32));
  });

  it("accepts deterministic seeds only in the test runtime", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(getRoomRandomness({ seed: 0 }).seed).toBe(0);
    expect(getRoomRandomness({ seed: 0 })).toEqual(getRoomRandomness({ seed: 0 }));
    expect(getRoomRandomness({}).seed).toBe(0x2a2a2a2a);
  });
});
