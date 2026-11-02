export const MatchQueue = {
  CASUAL: { name: "CASUAL", value: "casual", splitsByMatchSettings: true },
  UNLIMITED: { name: "UNLIMITED", value: "unlimited", splitsByMatchSettings: true },
  BETA: { name: "BETA", value: "beta", splitsByMatchSettings: true },
  MANUAL: { name: "MANUAL", value: "manual", splitsByMatchSettings: false },
  RANKED: { name: "RANKED", value: "ranked", splitsByMatchSettings: false },
} as const;

export type MatchQueue = (typeof MatchQueue)[keyof typeof MatchQueue]["value"];
