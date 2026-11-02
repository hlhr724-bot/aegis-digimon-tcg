import { describe, expect, it } from "vitest";
import { MAX_AVATAR_BYTES } from "@aegis/shared/account/maxAvatarBytes";
import { AvatarImageError, MAX_AVATAR_DIMENSION, inspectAvatarImage } from "./avatarImage.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "latin1");
  // The inspector copies CRC bytes without recomputing them, so a placeholder keeps the fixture small.
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function png(width: number, height: number, extra: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    ...extra,
    chunk("IDAT", Buffer.alloc(8)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function jpeg({ width, height, segments }: { width: number; height: number; segments: number[] }): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  for (const marker of segments) {
    const payload = Buffer.alloc(marker === 0xe1 ? 12 : 4, 0x41);
    const header = Buffer.from([0xff, marker, 0, 0]);
    header.writeUInt16BE(payload.length + 2, 2);
    parts.push(header, payload);
  }
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(11, 0);
  sof[2] = 8;
  sof.writeUInt16BE(height, 3);
  sof.writeUInt16BE(width, 5);
  sof[7] = 1;
  parts.push(Buffer.from([0xff, 0xc0]), sof);
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x02]), Buffer.from([0x11, 0x22, 0xff, 0xd9]));
  return Buffer.concat(parts);
}

function rejection(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    if (error instanceof AvatarImageError) return error.reason;
    throw error;
  }
}

describe("inspectAvatarImage", () => {
  it("keeps only the PNG chunks that carry pixels", () => {
    const text = chunk("tEXt", Buffer.from("Comment\0hidden"));
    const exif = chunk("eXIf", Buffer.from([1, 2, 3, 4]));
    const image = inspectAvatarImage(png(512, 256, [text, exif]));

    expect(image.contentType).toBe("image/png");
    expect(image.width).toBe(512);
    expect(image.height).toBe(256);
    expect(image.bytes.includes(Buffer.from("tEXt"))).toBe(false);
    expect(image.bytes.includes(Buffer.from("eXIf"))).toBe(false);
    expect(image.bytes.includes(Buffer.from("IHDR"))).toBe(true);
    expect(image.bytes.includes(Buffer.from("IEND"))).toBe(true);
  });

  it("drops JPEG metadata segments but keeps the frame and the scan", () => {
    const image = inspectAvatarImage(jpeg({ width: 300, height: 400, segments: [0xe1, 0xfe, 0xdb] }));

    expect(image.contentType).toBe("image/jpeg");
    expect(image.width).toBe(300);
    expect(image.height).toBe(400);
    expect(image.bytes.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
    expect(image.bytes.includes(Buffer.from([0xff, 0xfe]))).toBe(false);
    expect(image.bytes.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(image.bytes.includes(Buffer.from([0xff, 0xc0]))).toBe(true);
  });

  it("refuses formats it cannot reason about, including SVG", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(rejection(() => inspectAvatarImage(svg))).toBe("unsupported");
    expect(rejection(() => inspectAvatarImage(Buffer.from("GIF89a")))).toBe("unsupported");
    expect(rejection(() => inspectAvatarImage(Buffer.alloc(0)))).toBe("invalid");
  });

  it("refuses an upload larger than the ceiling", () => {
    const oversized = Buffer.concat([png(64, 64), Buffer.alloc(MAX_AVATAR_BYTES)]);
    expect(rejection(() => inspectAvatarImage(oversized))).toBe("too_large");
  });

  it("refuses dimensions above the limit", () => {
    expect(rejection(() => inspectAvatarImage(png(MAX_AVATAR_DIMENSION + 1, 16)))).toBe("dimensions");
    expect(rejection(() => inspectAvatarImage(png(16, MAX_AVATAR_DIMENSION + 1)))).toBe("dimensions");
  });

  it("refuses a truncated file instead of parsing it on trust", () => {
    const full = png(64, 64);
    expect(rejection(() => inspectAvatarImage(full.subarray(0, 20)))).toBe("invalid");
    const lying = Buffer.concat([full.subarray(0, 33), Buffer.from([0xff, 0xd8])]);
    expect(rejection(() => inspectAvatarImage(lying))).toBe("invalid");
  });
});
