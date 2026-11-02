import { StoryDifficulty, type StoryDifficultyEntry } from "#shared/story/StoryDifficulty";
import type { StoryBattle } from "#shared/story/StoryBattle";

const introShare = 0.2;
const challengeShare = 0.6;

type ProgressParams = { index: number; total: number };

function getProgressDifficulty({ index, total }: ProgressParams): StoryDifficultyEntry {
  const progress = index / total;
  if (progress < introShare) {
    return StoryDifficulty.INTRO;
  }
  if (progress < challengeShare) {
    return StoryDifficulty.CHALLENGE;
  }
  return StoryDifficulty.ELITE;
}

export function getStoryCampaignDifficulties(
  battles: readonly StoryBattle[],
): ReadonlyMap<string, StoryDifficultyEntry> {
  const finaleIndex = battles.map((battle) => !battle.isOptional).lastIndexOf(true);
  return new Map(
    battles.map((battle, index) => {
      if (index === finaleIndex || (battle.isOptional && index > finaleIndex)) {
        return [battle.id, StoryDifficulty.BOSS];
      }
      if (battle.isOptional) {
        return [battle.id, StoryDifficulty.ELITE];
      }
      return [battle.id, getProgressDifficulty({ index, total: battles.length })];
    }),
  );
}
