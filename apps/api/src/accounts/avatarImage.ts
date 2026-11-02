import { MAX_AVATAR_BYTES } from "@aegis/shared/account/maxAvatarBytes";

/** Bytes of a profile picture after validation, with every metadata segment removed. */
export type AvatarImage = {
  bytes: Buffer;
  contentType: AvatarImageType;
  width: number;
  height: number;
};

export type AvatarImageType = "image/jpeg" | "image/png";

export type AvatarImageRejection = "dimensions" | "invalid" | "too_large" | "unsupported";

export class AvatarImageError extends Error {
  constructor(readonly reason: AvatarImageRejection) {
    super(reason);
  }
}

/** Guards the decoder and the browser; a portrait larger than this is scaled down client-side. */
export const MAX_AVATAR_DIMENSION = 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Everything else (tEXt, zTXt, iTXt, eXIf, tIME, iCCP, aCtl) is dropped: metadata is payload we refuse to serve. */
const PNG_KEPT_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

function isPng(input: Buffer): boolean {
  return input.length >= PNG_SIGNATURE.length && input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

function isJpeg(input: Buffer): boolean {
  return input.length >= 2 && input[0] === 0xff && input[1] === 0xd8;
}

function checked(image: AvatarImage, width: number, height: number): AvatarImage {
  if (width <= 0 || height <= 0) throw new AvatarImageError("invalid");
  if (width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) throw new AvatarImageError("dimensions");
  return { ...image, width, height };
}

/**
 * Rebuilds a PNG from complete chunks, keeping the original CRC of each chunk it keeps.
 * A chunk that claims more bytes than the file holds is a truncated upload, so it is rejected
 * rather than parsed on trust.
 */
function stripPng(input: Buffer): AvatarImage {
  const kept: Buffer[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawEnd = false;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > input.length - offset - 12) throw new AvatarImageError("invalid");
    const type = input.toString("latin1", offset + 4, offset + 8);
    if (type === "IHDR") {
      if (length !== 13) throw new AvatarImageError("invalid");
      width = input.readUInt32BE(offset + 8);
      height = input.readUInt32BE(offset + 12);
      sawHeader = true;
    }
    if (PNG_KEPT_CHUNKS.has(type)) kept.push(input.subarray(offset, end));
    if (type === "IEND") {
      if (length !== 0) throw new AvatarImageError("invalid");
      sawEnd = true;
      offset = end;
      break;
    }
    offset = end;
  }
  if (!sawHeader || !sawEnd) throw new AvatarImageError("invalid");
  return checked({ bytes: Buffer.concat(kept), contentType: "image/png", width, height }, width, height);
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Copies every JPEG segment except APP0-APP15 (EXIF, XMP, ICC and thumbnails live there) and COM.
 * The entropy-coded scan after SOS is copied verbatim: it is image data, and re-encoding it would
 * need a decoder we do not carry.
 */
function stripJpeg(input: Buffer): AvatarImage {
  const kept: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;
  let width = 0;
  let height = 0;
  while (offset + 2 <= input.length) {
    if (input[offset] !== 0xff) throw new AvatarImageError("invalid");
    const markerStart = offset;
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    if (offset >= input.length) throw new AvatarImageError("invalid");
    const marker = input[offset]!;
    offset += 1;
    if (marker === 0xd9) {
      kept.push(input.subarray(markerStart, offset));
      return checked({ bytes: Buffer.concat(kept), contentType: "image/jpeg", width, height }, width, height);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(input.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > input.length) throw new AvatarImageError("invalid");
    const length = input.readUInt16BE(offset);
    if (length < 2) throw new AvatarImageError("invalid");
    const end = offset + length;
    if (end > input.length) throw new AvatarImageError("invalid");
    if (isStartOfFrame(marker)) {
      if (length < 7) throw new AvatarImageError("invalid");
      height = input.readUInt16BE(offset + 3);
      width = input.readUInt16BE(offset + 5);
    }
    const metadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) kept.push(input.subarray(markerStart, end));
    offset = end;
    if (marker === 0xda) {
      kept.push(input.subarray(offset));
      return checked({ bytes: Buffer.concat(kept), contentType: "image/jpeg", width, height }, width, height);
    }
  }
  throw new AvatarImageError("invalid");
}

/**
 * The only entry point for uploaded bytes. Anything unrecognised is refused by magic number, never
 * by the `Content-Type` the client claimed, and SVG is unsupported by construction because it can
 * carry script.
 */
export function inspectAvatarImage(input: Buffer): AvatarImage {
  if (input.length === 0) throw new AvatarImageError("invalid");
  if (input.length > MAX_AVATAR_BYTES) throw new AvatarImageError("too_large");
  if (isPng(input)) return stripPng(input);
  if (isJpeg(input)) return stripJpeg(input);
  throw new AvatarImageError("unsupported");
}
