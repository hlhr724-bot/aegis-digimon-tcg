import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { Button, Dialog } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { getLessonTextKey } from "@/learn/getLessonTextKey";
import { LessonReferences } from "@/learn/LessonReferences";
import { getTutorialLessonNumber } from "@/learn/getTutorialLessonNumber";
import "@/learn/learn.css";

type Params = { lesson: TutorialLesson; onStart: (lessonId: string) => void; onClose: () => void };

export function LessonBriefing({ lesson, onStart, onClose }: Params) {
  const { t } = useTranslation();
  const lessonNumber = getTutorialLessonNumber(lesson.id);
  let heading = t("learn.catalog.rulesPractice");
  if (lesson.keyword) {
    heading = t("learn.briefing.drill");
  } else if (lessonNumber > 0) {
    heading = t("learn.briefing.counter", { number: lessonNumber, total: tutorialLessons.length });
  }
  const titleId = "learn-briefing-title";
  return (
    <Dialog className="learn-briefing" labelledBy={titleId} onClose={onClose}>
      <span className="aegis-eyebrow">{heading}</span>
      <h2 id={titleId}>{t(getLessonTextKey({ lessonId: lesson.id, field: "title" }))}</h2>
      <p className="learn-briefing__goals-label">{t("learn.briefing.goals")}</p>
      <ul className="learn-briefing__goals">
        <li>{t(getLessonTextKey({ lessonId: lesson.id, field: "goal1" }))}</li>
        <li>{t(getLessonTextKey({ lessonId: lesson.id, field: "goal2" }))}</li>
      </ul>
      <p className="learn-briefing__note">{t("learn.briefing.note")}</p>
      <LessonReferences lesson={lesson} />
      <div className="learn-briefing__actions">
        <Button variant="secondary" onClick={onClose}>
          {t("learn.briefing.notNow")}
        </Button>
        <Button icon={Icons.Play} onClick={() => onStart(lesson.id)}>
          {t("learn.briefing.start")}
        </Button>
      </div>
    </Dialog>
  );
}
