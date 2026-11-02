import type { TutorialStep } from "#shared/tutorial/TutorialStep";

export type TutorialLesson = {
  id: string;
  minutes: number;
  rulesChapterId: string;
  prerequisiteId?: string;
  keyword?: string;
  steps: readonly TutorialStep[];
};
