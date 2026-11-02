export const CollectionTab = {
  CARDS: { name: "CARDS", value: "cards", labelKey: "redesign.collection.tabCards" },
  BOOSTERS: { name: "BOOSTERS", value: "boosters", labelKey: "redesign.collection.tabBoosters" },
} as const;

export type CollectionTab = (typeof CollectionTab)[keyof typeof CollectionTab]["value"];
