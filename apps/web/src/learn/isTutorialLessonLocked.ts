import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";

type Params = { lesson: TutorialLesson; completed: readonly string[] };

export function isTutorialLessonLocked({ lesson, completed }: Params): boolean {
  return lesson.prerequisiteId !== undefined && !completed.includes(lesson.prerequisiteId);
}
