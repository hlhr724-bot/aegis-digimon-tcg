export const LiveReplayAnnotationRejection = {
  SIGN_IN_REQUIRED: { name: "SIGN_IN_REQUIRED", value: "sign_in_required" },
  UNAVAILABLE: { name: "UNAVAILABLE", value: "unavailable" },
  LIMIT_REACHED: { name: "LIMIT_REACHED", value: "limit_reached" },
  TOO_FAST: { name: "TOO_FAST", value: "too_fast" },
  INVALID: { name: "INVALID", value: "invalid" },
} as const;

export type LiveReplayAnnotationRejection =
  (typeof LiveReplayAnnotationRejection)[keyof typeof LiveReplayAnnotationRejection]["value"];
