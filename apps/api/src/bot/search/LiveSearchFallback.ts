export const LiveSearchFallback = {
  DEADLINE: { name: "DEADLINE", value: "deadline" },
  CAPACITY: { name: "CAPACITY", value: "capacity" },
  ERROR: { name: "ERROR", value: "error" },
} as const;

export type LiveSearchFallback = (typeof LiveSearchFallback)[keyof typeof LiveSearchFallback]["value"];

export type LiveSearchFallbackCounts = Record<LiveSearchFallback, number>;
