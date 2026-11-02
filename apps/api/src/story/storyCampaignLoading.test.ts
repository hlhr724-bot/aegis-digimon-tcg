import { expect, it } from "vitest";
import { StoryCampaignId } from "@aegis/shared/story/StoryCampaignId";
import { getStoryCampaignBattles } from "@aegis/shared/story/getStoryCampaignBattles";
import { loadStoryCampaignBattles } from "@aegis/shared/story/loadStoryCampaignBattles";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { storyCampaignBattleIds } from "@aegis/shared/story/storyCampaignBattleIds";
import { storyCampaignBattleLoaders } from "@aegis/shared/story/storyCampaignBattleLoaders";

const campaignIds = [...new Set(storyBattles.map((battle) => battle.campaignId ?? StoryCampaignId.LIBERATOR.value))];

it("registers one lazy loader per campaign", () => {
  expect(Object.keys(storyCampaignBattleLoaders).sort()).toEqual([...campaignIds].sort());
});

it.each(campaignIds)("loads campaign %s on demand with the same battles as the full catalog", async (campaignId) => {
  expect(await loadStoryCampaignBattles({ campaignId })).toEqual(getStoryCampaignBattles({ campaignId }));
});

it("keeps the client battle id summary aligned with every campaign", () => {
  expect(storyCampaignBattleIds).toEqual(
    Object.fromEntries(
      campaignIds.map((campaignId) => [campaignId, getStoryCampaignBattles({ campaignId }).map((battle) => battle.id)]),
    ),
  );
});
