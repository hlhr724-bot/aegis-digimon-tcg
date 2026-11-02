import { expect, it } from "vitest";
import { findStoryBattleCampaignId } from "@/story/findStoryBattleCampaignId";

it.each([
  ["dw1-001", "digimon-world-1"],
  ["xw05", "digimon-xros-wars"],
  ["ice-knight", "liberator"],
  ["unknown-battle", "liberator"],
])("opens battle %s in campaign %s", (battleId, campaignId) => {
  expect(findStoryBattleCampaignId({ battleId })).toBe(campaignId);
});
