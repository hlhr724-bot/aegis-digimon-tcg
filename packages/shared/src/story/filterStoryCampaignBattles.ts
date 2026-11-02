import { StoryCampaignId } from "#shared/story/StoryCampaignId";
import { storyBattleAliases } from "#shared/story/storyBattleAliases";
import { storyCanonicalDefeatBattleIds } from "#shared/story/storyCanonicalDefeatBattleIds";
import type { StoryBattle } from "#shared/story/StoryBattle";

type Params = { battles: readonly StoryBattle[]; campaignId: string };

export function filterStoryCampaignBattles({ battles, campaignId }: Params): readonly StoryBattle[] {
  return battles
    .filter(
      (battle) =>
        (battle.campaignId ?? StoryCampaignId.LIBERATOR.value) === campaignId &&
        !Object.hasOwn(storyBattleAliases, battle.id) &&
        !storyCanonicalDefeatBattleIds.has(battle.id),
    )
    .map((battle) => {
      if (battle.id === "dw1-038") {
        return { ...battle, title: "Partner vs. Machinedramon", chapterId: "Back Dimension" };
      }
      return battle;
    });
}
