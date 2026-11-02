import { StoryCampaignId } from "@aegis/shared/story/StoryCampaignId";
import { storyBattleAliases } from "@aegis/shared/story/storyBattleAliases";
import { storyCampaignBattleIds } from "@aegis/shared/story/storyCampaignBattleIds";

type Params = { battleId: string };

export function findStoryBattleCampaignId({ battleId }: Params): string {
  const id = storyBattleAliases[battleId] ?? battleId;
  return (
    Object.entries(storyCampaignBattleIds).find(([, battleIds]) => battleIds.includes(id))?.[0] ??
    StoryCampaignId.LIBERATOR.value
  );
}
