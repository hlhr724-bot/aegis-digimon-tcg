import type { StoryBattle } from "#shared/story/StoryBattle";
import { filterStoryCampaignBattles } from "#shared/story/filterStoryCampaignBattles";
import { storyCampaignBattleLoaders } from "#shared/story/storyCampaignBattleLoaders";

type Params = { campaignId: string };

export async function loadStoryCampaignBattles({ campaignId }: Params): Promise<readonly StoryBattle[]> {
  const load = storyCampaignBattleLoaders[campaignId];
  return load ? filterStoryCampaignBattles({ battles: await load(), campaignId }) : [];
}
