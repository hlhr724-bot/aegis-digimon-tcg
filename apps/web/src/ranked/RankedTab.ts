export const RankedTab = {
  LEADERBOARD: { name: "LEADERBOARD", value: "leaderboard" },
  MATCHUPS: { name: "MATCHUPS", value: "matchups" },
  REWARDS: { name: "REWARDS", value: "rewards" },
  REPORTS: { name: "REPORTS", value: "reports" },
  META: { name: "META", value: "meta" },
} as const;
export type RankedTab = (typeof RankedTab)[keyof typeof RankedTab]["value"];
