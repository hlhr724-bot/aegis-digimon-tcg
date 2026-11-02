export const PlayTab = {
  MATCH: { name: "MATCH", value: "match", screen: "lobby", labelKey: "redesign.play.tab.match" },
  RANKED: { name: "RANKED", value: "ranked", screen: "ranked", labelKey: "redesign.play.tab.ranked" },
  ROOMS: { name: "ROOMS", value: "rooms", screen: "watch", labelKey: "redesign.play.tab.rooms" },
} as const;

export type PlayTab = (typeof PlayTab)[keyof typeof PlayTab]["value"];
