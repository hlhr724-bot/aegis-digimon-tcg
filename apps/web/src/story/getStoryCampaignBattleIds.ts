import { storyCampaignBattleIds } from "@aegis/shared/story/storyCampaignBattleIds";

type Params = { campaignId: string };

export function getStoryCampaignBattleIds({ campaignId }: Params): readonly string[] {
  return storyCampaignBattleIds[campaignId] ?? [];
}
