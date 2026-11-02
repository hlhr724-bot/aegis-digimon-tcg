export const StoryCampaignId = {
  LIBERATOR: { name: "LIBERATOR", value: "liberator" },
  WORLD_1: { name: "WORLD_1", value: "digimon-world-1" },
  WORLD_2: { name: "WORLD_2", value: "digimon-world-2" },
  WORLD_3: { name: "WORLD_3", value: "digimon-world-3" },
} as const;

export type StoryCampaignId = (typeof StoryCampaignId)[keyof typeof StoryCampaignId]["value"];
