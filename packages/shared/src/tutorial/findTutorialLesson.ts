import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { keywordDrills } from "#shared/tutorial/keywordDrills";
import { tutorialLessons } from "#shared/tutorial/tutorialLessons";
import { rulePracticeLessons } from "#shared/tutorial/rulePracticeLessons";

export function findTutorialLesson(id: unknown): TutorialLesson | undefined {
  if (typeof id !== "string") {
    return undefined;
  }
  return [...tutorialLessons, ...keywordDrills, ...rulePracticeLessons].find((lesson) => lesson.id === id);
}
