import { catalogStoryBattles } from "#shared/story/catalogStoryBattles";
import { liberatorStoryBattles } from "#shared/story/liberatorStoryBattles";
import type { StoryBattle } from "#shared/story/StoryBattle";

export const storyBattles: readonly StoryBattle[] = [...liberatorStoryBattles, ...catalogStoryBattles];
