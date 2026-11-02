import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { Button, Dialog } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { getLessonTextKey } from "@/learn/getLessonTextKey";

type Params = {
  lesson: TutorialLesson;
  won: boolean;
  onStartLesson: (lessonId: string) => void;
  onLeave: () => void;
};

function findNextLesson(lesson: TutorialLesson): TutorialLesson | undefined {
  const index = tutorialLessons.findIndex((entry) => entry.id === lesson.id);
  return index < 0 ? undefined : tutorialLessons[index + 1];
}

export function TutorialResult({ lesson, won, onStartLesson, onLeave }: Params) {
  const { t } = useTranslation();
  const titleId = "tutorial-result-title";
  const next = won ? findNextLesson(lesson) : undefined;
  return (
    <Dialog className="tutorial-result" labelledBy={titleId} closeOnBackdrop={false} closeOnEscape={false}>
      <span className="tutorial-result__icon" data-won={won || undefined} aria-hidden="true">
        {won ? <Icons.CircleCheck size={28} /> : <Icons.RotateCcw size={28} />}
      </span>
      <h2 id={titleId}>{won ? t("learn.complete.title") : t("learn.complete.failedTitle")}</h2>
      <p className="tutorial-result__lesson">{t(getLessonTextKey({ lessonId: lesson.id, field: "title" }))}</p>
      {won ? (
        <p>
          <strong>{t("learn.complete.learned")}</strong> {t(getLessonTextKey({ lessonId: lesson.id, field: "done" }))}
        </p>
      ) : (
        <p>{t("learn.complete.failedBody")}</p>
      )}
      <div className="tutorial-result__actions">
        <Button variant="secondary" onClick={onLeave}>
          {t("learn.complete.back")}
        </Button>
        {won && next ? (
          <Button icon={Icons.ArrowRight} onClick={() => onStartLesson(next.id)}>
            {t("learn.complete.next")}
          </Button>
        ) : null}
        {!won ? (
          <Button icon={Icons.RotateCcw} onClick={() => onStartLesson(lesson.id)}>
            {t("learn.complete.tryAgain")}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
