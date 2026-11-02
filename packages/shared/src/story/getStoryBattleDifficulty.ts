import type { StoryDifficultyEntry } from "#shared/story/StoryDifficulty";
import { getStoryCampaignBattles } from "#shared/story/getStoryCampaignBattles";
import { getStoryCampaignDifficulties } from "#shared/story/getStoryCampaignDifficulties";
import { storyBattleAliases } from "#shared/story/storyBattleAliases";
import { storyBattles } from "#shared/story/storyBattles";

type Params = { battleId: string };

function buildDifficulties(): ReadonlyMap<string, StoryDifficultyEntry> {
  const campaignIds = new Set(storyBattles.flatMap((battle) => (battle.campaignId ? [battle.campaignId] : [])));
  return new Map(
    [...campaignIds].flatMap((campaignId) => [
      ...getStoryCampaignDifficulties(getStoryCampaignBattles({ campaignId })),
    ]),
  );
}

const difficulties = buildDifficulties();

export function getStoryBattleDifficulty({ battleId }: Params): StoryDifficultyEntry | undefined {
  const id = Object.hasOwn(storyBattleAliases, battleId) ? storyBattleAliases[battleId]! : battleId;
  return difficulties.get(id);
}
