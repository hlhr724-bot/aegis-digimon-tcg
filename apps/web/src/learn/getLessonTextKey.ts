import type { TranslationKey } from "@/i18n/translationTypes";

export type LessonTextField = "title" | "summary" | "goal1" | "goal2" | "done";

type Params = { lessonId: string; field: LessonTextField };

export function getLessonTextKey({ lessonId, field }: Params): TranslationKey {
  return `learn.lesson.${lessonId}.${field}` as TranslationKey;
}
