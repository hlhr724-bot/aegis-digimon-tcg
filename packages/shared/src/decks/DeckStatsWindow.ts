export const DeckStatsWindow = {
  LAST_100: { name: "LAST_100", value: "last100", matchLimit: 100 },
  ALL: { name: "ALL", value: "all", matchLimit: undefined },
} as const;

export type DeckStatsWindow = (typeof DeckStatsWindow)[keyof typeof DeckStatsWindow]["value"];
