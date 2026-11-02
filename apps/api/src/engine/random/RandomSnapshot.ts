import type { RandomAlgorithm } from "#api/engine/random/RandomAlgorithm";

export type RandomSnapshot =
  | { algorithm: typeof RandomAlgorithm.MULBERRY32.value; state: number }
  | { algorithm: typeof RandomAlgorithm.HMAC_SHA256.value; seed: number; counter: number; keyFingerprint: string };
