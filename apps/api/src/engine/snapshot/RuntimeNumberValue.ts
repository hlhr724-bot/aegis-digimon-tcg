export const RuntimeNumberValue = {
  NAN: { name: "NAN", value: "nan" },
  POSITIVE_INFINITY: { name: "POSITIVE_INFINITY", value: "positive-infinity" },
  NEGATIVE_INFINITY: { name: "NEGATIVE_INFINITY", value: "negative-infinity" },
  NEGATIVE_ZERO: { name: "NEGATIVE_ZERO", value: "negative-zero" },
} as const;

export type RuntimeNumberValue = (typeof RuntimeNumberValue)[keyof typeof RuntimeNumberValue]["value"];
