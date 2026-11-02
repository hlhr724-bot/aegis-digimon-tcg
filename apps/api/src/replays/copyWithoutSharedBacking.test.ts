import { zstdCompressSync } from "node:zlib";
import { expect, it } from "vitest";
import { copyWithoutSharedBacking } from "./copyWithoutSharedBacking.js";

it("stores a small compressed frame without retaining zlib's larger output buffer", () => {
  const compressed = zstdCompressSync(Buffer.from(JSON.stringify({ board: "x".repeat(20_000) })));
  expect(compressed.buffer.byteLength).toBeGreaterThan(compressed.length);

  const copy = copyWithoutSharedBacking(compressed);

  expect(copy.buffer.byteLength).toBe(compressed.length);
  expect(Buffer.from(copy).equals(compressed)).toBe(true);
});
