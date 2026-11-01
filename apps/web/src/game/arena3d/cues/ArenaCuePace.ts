export const ArenaCuePace = {
  IDLE: { name: "IDLE", value: "idle" },
  SETTLED: { name: "SETTLED", value: "settled" },
  TRANSITION: { name: "TRANSITION", value: "transition" },
} as const;

export type ArenaCuePace = (typeof ArenaCuePace)[keyof typeof ArenaCuePace]["value"];
