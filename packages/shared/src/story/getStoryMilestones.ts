import { isStoryCampaignComplete } from "#shared/story/isStoryCampaignComplete";
import { getStoryCampaignBattles } from "#shared/story/getStoryCampaignBattles";
import { normalizeStoryCompleted } from "#shared/story/normalizeStoryCompleted";
import { storyBattleAliases } from "#shared/story/storyBattleAliases";
import { storyBattles } from "#shared/story/storyBattles";
import { StoryCampaignId } from "#shared/story/StoryCampaignId";
import { getWorldStoryMilestones } from "#shared/story/getWorldStoryMilestones";

type Params = { completed: readonly string[] };

export function getStoryMilestones({ completed }: Params): string[] {
  const canonicalCompleted = normalizeStoryCompleted({ completed });
  const milestones = new Set(getWorldStoryMilestones({ completed: canonicalCompleted }));
  for (const battle of storyBattles) {
    if (!Object.hasOwn(storyBattleAliases, battle.id) && canonicalCompleted.includes(battle.id)) {
      milestones.add(`battle:${battle.id}`);
    }
  }
  for (const campaignId of new Set(
    storyBattles.map((battle) => battle.campaignId ?? StoryCampaignId.LIBERATOR.value),
  )) {
    const campaign = getStoryCampaignBattles({ campaignId });
    for (const chapterId of new Set(campaign.map((battle) => battle.chapterId ?? battle.character))) {
      const chapter = campaign.filter((battle) => (battle.chapterId ?? battle.character) === chapterId);
      if (campaignId === StoryCampaignId.WORLD_1.value && (chapterId === "native-forest" || chapterId === "ogremon")) {
        continue;
      }
      const chapterComplete = chapter.some((battle) => !battle.isOptional)
        ? isStoryCampaignComplete({ battles: chapter, completed: canonicalCompleted })
        : chapter.length > 0 && chapter.every((battle) => canonicalCompleted.includes(battle.id));
      if (chapterComplete) {
        milestones.add(`chapter:${campaignId}:${chapterId}`);
      }
    }
    if (isStoryCampaignComplete({ battles: campaign, completed: canonicalCompleted })) {
      milestones.add(`story:${campaignId}`);
    }
  }
  return [...milestones];
}
