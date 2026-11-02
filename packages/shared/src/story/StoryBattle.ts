import type { storyCatalogDecks } from "#shared/story/storyCatalogDecks";
import type { StoryBattleKind } from "#shared/story/StoryBattleKind";

export type StoryBattle = {
  kind: StoryBattleKind;
  id: string;
  title: string;
  character: string;
  opponent: string;
  chapters: { title: string; url: string }[];
  sourceUrl: string;
  playable: boolean;
  adapted: boolean;
  coverImageUrl: string;
  prerequisiteId?: string;
  prerequisiteIds?: readonly string[];
  campaignId?: string;
  chapterId?: string;
  isOptional?: boolean;
  completionGroup?: string;
  playerDeckRef?: keyof typeof storyCatalogDecks;
  opponentDeckRef?: keyof typeof storyCatalogDecks;
};

export type StoryProgress = { completed: string[] };
