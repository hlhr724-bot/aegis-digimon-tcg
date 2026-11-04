export const MatchupVerdict = {
  FAVORED: { name: "FAVORED", value: "favored" },
  CLOSE: { name: "CLOSE", value: "close" },
  BEHIND: { name: "BEHIND", value: "behind" },
} as const;

export type MatchupVerdict = (typeof MatchupVerdict)[keyof typeof MatchupVerdict]["value"];
