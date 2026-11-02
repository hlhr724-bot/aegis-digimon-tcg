import { storyBattles } from "#shared/story/storyBattles";
import { filterStoryCampaignBattles } from "#shared/story/filterStoryCampaignBattles";
import type { StoryBattle } from "#shared/story/StoryBattle";

type Params = { campaignId: string };

export function getStoryCampaignBattles({ campaignId }: Params): readonly StoryBattle[] {
  return filterStoryCampaignBattles({ battles: storyBattles, campaignId });
}
