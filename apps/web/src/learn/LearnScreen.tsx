import { useState } from "react";
import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { findTutorialLesson } from "@aegis/shared/tutorial/findTutorialLesson";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { getNextTutorialLesson } from "@/learn/getNextTutorialLesson";
import { getTutorialLessonNumber } from "@/learn/getTutorialLessonNumber";
import { isTutorialLessonLocked } from "@/learn/isTutorialLessonLocked";
import { LessonBriefing } from "@/learn/LessonBriefing";
import { LessonRow, type LessonRowStatus } from "@/learn/LessonRow";
import { lessonGroups } from "@/learn/lessonGroups";
import { useLessonProgress } from "@/learn/useLessonProgress";
import type { RulesChapterId } from "@/learn/rules/rulesChapters";
import "@/learn/learn.css";

const catalogLessonIds = [...new Set(lessonGroups.flatMap((group) => group.lessons.map((lesson) => lesson.id)))];

type Params = {
  signedIn: boolean;
  onSignIn: () => void;
  onStartLesson: (lessonId: string) => void;
  onOpenRules: (chapterId?: RulesChapterId) => void;
};

type LessonStatusParams = { lesson: TutorialLesson; completed: readonly string[]; nextId: string | undefined };

function getLessonStatus({ lesson, completed, nextId }: LessonStatusParams): LessonRowStatus {
  if (completed.includes(lesson.id)) {
    return "done";
  }
  if (isTutorialLessonLocked({ lesson, completed })) {
    return "locked";
  }
  if (lesson.id === nextId) {
    return "next";
  }
  return "ready";
}

type PracticeStatusParams = { lesson: TutorialLesson; completed: readonly string[] };

function getPracticeStatus({ lesson, completed }: PracticeStatusParams): LessonRowStatus {
  return completed.includes(lesson.id) ? "done" : "ready";
}

export function LearnScreen({ signedIn, onSignIn, onStartLesson, onOpenRules }: Params) {
  const { t } = useTranslation();
  const progress = useLessonProgress({ signedIn });
  const [briefingLesson, setBriefingLesson] = useState<TutorialLesson>();
  const completed = progress.completed ?? [];
  const completedCount = catalogLessonIds.filter((lessonId) => completed.includes(lessonId)).length;
  const nextLesson = getNextTutorialLesson({ completed });
  const heroLesson = nextLesson ?? tutorialLessons[0];
  const openBriefing = (lessonId: string) => setBriefingLesson(findTutorialLesson(lessonId));
  const progressLabel = t("learn.progress", { completed: completedCount, total: catalogLessonIds.length });

  return (
    <main className="learn-page">
      <div className="aegis-page-sheet aegis-page-sheet--padded learn-sheet">
        <header className="learn-hero">
          <span className="aegis-eyebrow">{t("learn.eyebrow")}</span>
          <h1>{t("learn.title")}</h1>
          <p className="learn-hero__lede">{t("learn.lede")}</p>
          <div className="learn-hero__actions">
            {heroLesson ? (
              <Button size="lg" icon={Icons.Play} onClick={() => openBriefing(heroLesson.id)}>
                {nextLesson
                  ? t("learn.startLesson", { number: getTutorialLessonNumber(heroLesson.id) })
                  : t("learn.replayLessons")}
              </Button>
            ) : null}
            <a
              className="aegis-button aegis-button--secondary aegis-button--lg"
              href="/learn/rules#chapter-goal"
              onClick={(event) => {
                event.preventDefault();
                onOpenRules("goal");
              }}
            >
              <Icons.BookOpen size={18} />
              {t("learn.readRules")}
            </a>
          </div>
          <div className="learn-progress" role="group" aria-label={progressLabel}>
            <div className="learn-progress__bar" aria-hidden="true">
              <span style={{ width: `${(completedCount / catalogLessonIds.length) * 100}%` }} />
            </div>
            <span>{progressLabel}</span>
          </div>
        </header>

        {!signedIn ? (
          <div className="learn-notice">
            <Icons.Devices size={18} />
            <p>{t("learn.guestNote")}</p>
            <Button size="sm" variant="secondary" onClick={onSignIn}>
              {t("nav.signIn")}
            </Button>
          </div>
        ) : null}

        <section className="learn-section" aria-labelledby="learn-lessons-heading">
          <h2 id="learn-lessons-heading">{t("learn.lessonsHeading")}</h2>
          <p className="learn-section__lede">{t("learn.catalog.introduction")}</p>
          <nav className="learn-subsections" aria-label={t("learn.catalog.navigation")}>
            {lessonGroups.map((group) => (
              <a key={group.id} href={`#lessons-${group.id}`}>
                {t(group.titleKey)} <span>{group.lessons.length}</span>
              </a>
            ))}
          </nav>
          {lessonGroups.map((group) => (
            <section
              key={group.id}
              id={`lessons-${group.id}`}
              className="learn-module"
              aria-labelledby={`lessons-${group.id}-heading`}
            >
              <header className="learn-module__header">
                <h3 id={`lessons-${group.id}-heading`}>{t(group.titleKey)}</h3>
                <span>
                  {t("learn.catalog.groupProgress", {
                    completed: group.lessons.filter((lesson) => completed.includes(lesson.id)).length,
                    count: group.lessons.length,
                  })}
                </span>
                <p>{t(group.descriptionKey)}</p>
              </header>
              <ol className="learn-lessons" aria-busy={!progress.completed}>
                {group.lessons.map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    number={group.numbered ? getTutorialLessonNumber(lesson.id) : undefined}
                    status={
                      group.numbered
                        ? getLessonStatus({ lesson, completed, nextId: nextLesson?.id })
                        : getPracticeStatus({ lesson, completed })
                    }
                    onStart={openBriefing}
                    onOpenRules={onOpenRules}
                  />
                ))}
              </ol>
            </section>
          ))}
        </section>
      </div>
      {briefingLesson ? (
        <LessonBriefing
          lesson={briefingLesson}
          onClose={() => setBriefingLesson(undefined)}
          onStart={(lessonId) => {
            setBriefingLesson(undefined);
            onStartLesson(lessonId);
          }}
        />
      ) : null}
    </main>
  );
}
