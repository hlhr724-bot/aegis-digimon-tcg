import type { StoryProgress } from "#shared/story/StoryBattle";

export type StoryCampaignProgress = StoryProgress & {
  milestones: string[];
  contentRevision: string;
};
