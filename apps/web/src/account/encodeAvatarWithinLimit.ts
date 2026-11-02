import { MAX_AVATAR_BYTES } from "@aegis/shared/account/maxAvatarBytes";

export type AvatarEncoding = { type: "image/png" } | { type: "image/jpeg"; quality: number };

export const AVATAR_ENCODINGS: readonly AvatarEncoding[] = [
  { type: "image/png" },
  { type: "image/jpeg", quality: 0.92 },
  { type: "image/jpeg", quality: 0.82 },
  { type: "image/jpeg", quality: 0.7 },
  { type: "image/jpeg", quality: 0.55 },
];

export const AVATAR_EDGE = 512;

export const AVATAR_EDGES: readonly number[] = [AVATAR_EDGE, 384, 256, 128];

export async function encodeAvatarWithinLimit(
  encode: (edge: number, encoding: AvatarEncoding) => Promise<Blob>,
  maxBytes = MAX_AVATAR_BYTES,
): Promise<Blob> {
  for (const edge of AVATAR_EDGES) {
    for (const encoding of AVATAR_ENCODINGS) {
      const blob = await encode(edge, encoding);
      if (blob.size <= maxBytes) return blob;
    }
  }
  throw new Error("avatar_too_large");
}
