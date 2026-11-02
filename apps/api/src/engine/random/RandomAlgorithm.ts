export const RandomAlgorithm = {
  MULBERRY32: { name: "MULBERRY32", value: "mulberry32" },
  HMAC_SHA256: { name: "HMAC_SHA256", value: "hmac-sha256" },
} as const;

export type RandomAlgorithm = (typeof RandomAlgorithm)[keyof typeof RandomAlgorithm]["value"];
