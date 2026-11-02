import { findTutorialLesson } from "@aegis/shared/tutorial/findTutorialLesson";
import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { getLessonTextKey } from "@/learn/getLessonTextKey";
import { getRulesGuideLabels } from "@/learn/rules/getRulesGuideLabels";
import type { RulesChapterId } from "@/learn/rules/rulesChapters";
import { rulesChapterBattles } from "@/learn/rules/rulesChapterBattles";
import { LessonReferences } from "@/learn/LessonReferences";

type Params = { chapterId: RulesChapterId; onTryBattle: (lesson: TutorialLesson) => void };

export function ChapterBattleList({ chapterId, onTryBattle }: Params) {
  const { t, locale } = useTranslation();
  const labels = getRulesGuideLabels(locale);
  return (
    <div className="rules-battles">
      <h3 lang={locale === "pt-BR" ? "pt-BR" : "en"}>{labels.battles}</h3>
      <ul className="rules-battles__list">
        {rulesChapterBattles[chapterId].map((id) => {
          const lesson = findTutorialLesson(id);
          if (!lesson) {
            return null;
          }
          const title = t(getLessonTextKey({ lessonId: id, field: "title" }));
          return (
            <li className="rules-battle" key={id}>
              <div className="rules-battle__body">
                <h4>{title}</h4>
                <p>{t(getLessonTextKey({ lessonId: id, field: "summary" }))}</p>
                <LessonReferences lesson={lesson} />
                <span className="rules-battle__minutes">{t("learn.minutes", { minutes: lesson.minutes })}</span>
              </div>
              <button
                className="rules-try"
                type="button"
                aria-label={t("learn.guide.playBattleLabel", { title })}
                onClick={() => onTryBattle(lesson)}
              >
                <Icons.Play size={16} />
                <span className="rules-try__label" lang={locale === "pt-BR" ? "pt-BR" : "en"}>
                  {labels.playBattle}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
