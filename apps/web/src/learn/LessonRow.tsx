import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { Button } from "@/design/primitives";
import { Icons, type IconComponent } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import { getLessonTextKey } from "@/learn/getLessonTextKey";
import { LessonReferences } from "@/learn/LessonReferences";
import { rulesChapters, type RulesChapterId } from "@/learn/rules/rulesChapters";

export type LessonRowStatus = "done" | "next" | "ready" | "locked";

type Params = {
  lesson: TutorialLesson;
  number?: number;
  status: LessonRowStatus;
  onStart: (lessonId: string) => void;
  onOpenRules: (chapterId: RulesChapterId) => void;
};

const statusDisplay: Record<LessonRowStatus, { labelKey: TranslationKey; icon: IconComponent }> = {
  done: { labelKey: "learn.status.done", icon: Icons.CircleCheck },
  next: { labelKey: "learn.status.next", icon: Icons.Play },
  ready: { labelKey: "learn.status.ready", icon: Icons.CircleCheck },
  locked: { labelKey: "learn.status.locked", icon: Icons.Lock },
};

export function LessonRow({ lesson, number, status, onStart, onOpenRules }: Params) {
  const { t } = useTranslation();
  const display = statusDisplay[status];
  const StatusIcon = display.icon;
  const titleId = `learn-lesson-${lesson.id}`;
  const chapter = rulesChapters.find((entry) => entry.id === lesson.rulesChapterId);
  return (
    <li className="learn-lesson" data-status={status} aria-labelledby={titleId}>
      <span className="learn-lesson__number" aria-hidden="true">
        {number === undefined ? <Icons.Play size={18} /> : String(number).padStart(2, "0")}
      </span>
      <div className="learn-lesson__body">
        <h4 id={titleId}>{t(getLessonTextKey({ lessonId: lesson.id, field: "title" }))}</h4>
        <p>{t(getLessonTextKey({ lessonId: lesson.id, field: "summary" }))}</p>
        {status === "locked" ? <p>{t("learn.lockedReason")}</p> : null}
        <LessonReferences lesson={lesson} />
        {chapter ? (
          <a
            className="learn-lesson__guide"
            href={`/learn/rules#chapter-${lesson.rulesChapterId}`}
            onClick={(event) => {
              event.preventDefault();
              onOpenRules(chapter.id);
            }}
          >
            {t("learn.catalog.readChapter")}
          </a>
        ) : null}
      </div>
      <span className="learn-lesson__status">
        <StatusIcon size={16} />
        <span>{t(display.labelKey)}</span>
      </span>
      <span className="learn-lesson__minutes">{t("learn.minutes", { minutes: lesson.minutes })}</span>
      <div className="learn-lesson__action">
        <Button
          size="sm"
          variant={status === "next" ? "primary" : "secondary"}
          disabled={status === "locked"}
          icon={status === "done" ? Icons.RotateCcw : Icons.Play}
          onClick={() => onStart(lesson.id)}
          aria-describedby={titleId}
        >
          {status === "done" ? t("learn.replay") : t("learn.start")}
        </Button>
      </div>
    </li>
  );
}
