import type { TranslationKey } from "@/i18n/translationTypes";

type Params = { lessonId: string; stepId: string; hint?: boolean };

export function getLessonStepTextKey({ lessonId, stepId, hint = false }: Params): TranslationKey {
  const key = `learn.lesson.${lessonId}.step.${stepId}`;
  return (hint ? `${key}.hint` : key) as TranslationKey;
}
