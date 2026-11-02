import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { useTranslation } from "@/i18n/useTranslation";
import { getLessonRuleReferences } from "@/learn/getLessonRuleReferences";
import { getOfficialRuleUrl } from "@/learn/rules/getOfficialRuleUrl";

type Params = { lesson: TutorialLesson };

export function LessonReferences({ lesson }: Params) {
  const { t } = useTranslation();
  return (
    <ul className="learn-lesson__references" aria-label={t("learn.catalog.officialRules")}>
      {getLessonRuleReferences(lesson).map((rule) => (
        <li key={rule}>
          <a href={getOfficialRuleUrl(rule)} target="_blank" rel="noreferrer">
            {t("learn.rules.keywordRule", { rule })}
          </a>
        </li>
      ))}
    </ul>
  );
}
