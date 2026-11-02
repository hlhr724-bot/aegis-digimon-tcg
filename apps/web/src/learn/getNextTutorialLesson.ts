import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";

type Params = { completed: readonly string[] };

export function getNextTutorialLesson({ completed }: Params): TutorialLesson | undefined {
  return tutorialLessons.find((lesson) => !completed.includes(lesson.id));
}
