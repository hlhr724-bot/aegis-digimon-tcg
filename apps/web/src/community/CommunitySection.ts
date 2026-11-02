export const CommunitySection = {
  DECKS: { name: "DECKS", value: "decks" },
  META: { name: "META", value: "meta" },
  ROADMAP: { name: "ROADMAP", value: "roadmap" },
} as const;
export type CommunitySection = (typeof CommunitySection)[keyof typeof CommunitySection]["value"];
