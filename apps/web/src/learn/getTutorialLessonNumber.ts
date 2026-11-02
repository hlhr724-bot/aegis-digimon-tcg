import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";

export function getTutorialLessonNumber(lessonId: string): number {
  return tutorialLessons.findIndex((lesson) => lesson.id === lessonId) + 1;
}
