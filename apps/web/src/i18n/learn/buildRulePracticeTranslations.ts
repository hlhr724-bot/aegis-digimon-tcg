type Params<T extends Record<string, string>> = { dictionary: T };
type PracticeTranslations<T> = {
  [
    Key in keyof T as Key extends `learn.lesson.tutorial-${infer Suffix}` ? `learn.lesson.practice-${Suffix}` : never
  ]: string;
};

export function buildRulePracticeTranslations<T extends Record<string, string>>({
  dictionary,
}: Params<T>): PracticeTranslations<T> {
  return Object.fromEntries(
    Object.entries(dictionary)
      .filter(([key]) => key.startsWith("learn.lesson.tutorial-"))
      .map(([key, value]) => [key.replace("learn.lesson.tutorial-", "learn.lesson.practice-"), value]),
  ) as PracticeTranslations<T>;
}
