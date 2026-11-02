import type { StoryBattle } from "#shared/story/StoryBattle";
import { storyCatalogBattles } from "#shared/story/storyCatalogBattles";
import { toCatalogStoryBattle } from "#shared/story/toCatalogStoryBattle";

export const catalogStoryBattles: readonly StoryBattle[] = storyCatalogBattles.map(toCatalogStoryBattle);
