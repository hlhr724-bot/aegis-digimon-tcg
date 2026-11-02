import { describe, expect, it } from "vitest";
import { encodeAvatarWithinLimit, type AvatarEncoding } from "./encodeAvatarWithinLimit";

function sizedBlob(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

describe("encodeAvatarWithinLimit", () => {
  it("keeps the full-size PNG when it fits", async () => {
    const attempts: Array<[number, AvatarEncoding]> = [];
    const blob = await encodeAvatarWithinLimit(async (edge, encoding) => {
      attempts.push([edge, encoding]);
      return sizedBlob(100, encoding.type);
    }, 100);
    expect(blob.type).toBe("image/png");
    expect(attempts).toEqual([[512, { type: "image/png" }]]);
  });

  it("falls back to JPEG before shrinking the picture", async () => {
    const blob = await encodeAvatarWithinLimit(
      async (_edge, encoding) => sizedBlob(encoding.type === "image/png" ? 500 : 80, encoding.type),
      100,
    );
    expect(blob.type).toBe("image/jpeg");
  });

  it("shrinks the edge when no encoding fits at full size", async () => {
    const edges: number[] = [];
    await encodeAvatarWithinLimit(async (edge, encoding) => {
      edges.push(edge);
      return sizedBlob(edge > 256 ? 500 : 50, encoding.type);
    }, 100);
    expect(edges.at(-1)).toBe(256);
  });

  it("rejects when every attempt is over the limit", async () => {
    await expect(
      encodeAvatarWithinLimit(async (_edge, encoding) => sizedBlob(500, encoding.type), 100),
    ).rejects.toThrow("avatar_too_large");
  });
});
