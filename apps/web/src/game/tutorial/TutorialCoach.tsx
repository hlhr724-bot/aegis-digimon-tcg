import { useEffect, useState } from "react";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Seat } from "@aegis/shared/schema/enums";
import { TutorialGoalKind } from "@aegis/shared/tutorial/TutorialGoalKind";
import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import type { TutorialStep } from "@aegis/shared/tutorial/TutorialStep";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { TOUCH_LAYOUT_QUERY, useMediaQuery } from "@/design/useMediaQuery";
import { evaluateTutorialGoal } from "@/game/tutorial/evaluateTutorialGoal";
import { findTutorialHighlightElement } from "@/game/tutorial/findTutorialHighlightElement";
import { TutorialResult } from "@/game/tutorial/TutorialResult";
import { TutorialSpotlight } from "@/game/tutorial/TutorialSpotlight";
import { TutorialCoachWindow } from "@/game/tutorial/TutorialCoachWindow";
import { useTranslation } from "@/i18n/useTranslation";
import { getLessonStepTextKey } from "@/learn/getLessonStepTextKey";
import "@/game/tutorial/tutorialCoach.css";

type Params = {
  lesson: TutorialLesson;
  state: GameState;
  viewerSeat: Seat;
  onStartLesson: (lessonId: string) => void;
  onLeave: () => void;
};

function isBlockStep(step: TutorialStep | undefined): boolean {
  return step?.goal.kind === TutorialGoalKind.BLOCK_WINDOW_OPEN.value;
}

function getStepState(index: number, current: number): "done" | "current" | undefined {
  if (index < current) {
    return "done";
  }
  if (index === current) {
    return "current";
  }
  return undefined;
}

function hasViewerDecision(state: GameState, viewerSeat: Seat): boolean {
  return state.pendingDecision?.seat === viewerSeat || state.combatWindow?.seat === viewerSeat;
}

export function TutorialCoach({ lesson, state, viewerSeat, onStartLesson, onLeave }: Params) {
  const { t } = useTranslation();
  const touchLayout = useMediaQuery(TOUCH_LAYOUT_QUERY);
  const [stepIndex, setStepIndex] = useState(0);
  const [hintOpen, setHintOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(touchLayout);
  const [expandedDecision, setExpandedDecision] = useState<string | GameState["combatWindow"]>();
  const [celebrating, setCelebrating] = useState(false);
  const [highlightElement, setHighlightElement] = useState<HTMLElement | null>(null);
  const step = lesson.steps[stepIndex];
  const finished = stepIndex >= lesson.steps.length;

  const advance = () => {
    setStepIndex((index) => index + 1);
    setHintOpen(false);
  };

  useEffect(() => {
    if (step && evaluateTutorialGoal({ goal: step.goal, state, viewerSeat })) {
      setCelebrating(true);
      advance();
    }
  }, [state.stateVersion, step, state, viewerSeat]);

  useEffect(() => {
    if (!step?.highlight) {
      setHighlightElement(null);
      return;
    }
    const highlight = step.highlight;
    let frame = 0;
    const locate = () => {
      setHighlightElement(findTutorialHighlightElement({ highlight, state, viewerSeat, root: document }));
      frame = requestAnimationFrame(locate);
    };
    frame = requestAnimationFrame(locate);
    return () => cancelAnimationFrame(frame);
  }, [step, state, viewerSeat]);

  if (state.gameOver) {
    return (
      <TutorialResult
        lesson={lesson}
        won={state.winnerSeat === viewerSeat}
        onStartLesson={onStartLesson}
        onLeave={onLeave}
      />
    );
  }

  const decisionWaiting =
    hasViewerDecision(state, viewerSeat) && !isBlockStep(step) && !isBlockStep(lesson.steps[stepIndex - 1]);
  const decision = state.pendingDecision?.decisionId ?? state.combatWindow;
  const minimized = collapsed || (decisionWaiting && expandedDecision !== decision);
  const counter = t("learn.coach.counter", {
    current: Math.min(stepIndex + 1, lesson.steps.length),
    total: lesson.steps.length,
  });

  return (
    <>
      <TutorialCoachWindow
        compact={minimized}
        counter={counter}
        celebrating={celebrating}
        onToggle={() => {
          setCollapsed(!minimized);
          setExpandedDecision(decision);
        }}
      >
        <div className="tutorial-coach__progress" aria-hidden="true">
          {lesson.steps.map((entry, index) => (
            <span key={entry.id} data-state={getStepState(index, stepIndex)} />
          ))}
        </div>
        <p className="tutorial-coach__text" aria-live="polite">
          {step ? t(getLessonStepTextKey({ lessonId: lesson.id, stepId: step.id })) : t("learn.coach.finished")}
        </p>
        {step && hintOpen ? (
          <p className="tutorial-coach__hint">
            {t(getLessonStepTextKey({ lessonId: lesson.id, stepId: step.id, hint: true }))}
          </p>
        ) : null}
        {!finished ? (
          <div className="tutorial-coach__actions">
            {step?.goal.kind === TutorialGoalKind.ACKNOWLEDGE.value ? (
              <Button
                size="sm"
                icon={Icons.ArrowRight}
                onClick={() => {
                  setCelebrating(false);
                  advance();
                }}
              >
                {t("learn.coach.next")}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={Icons.Lightbulb} onClick={() => setHintOpen((open) => !open)}>
                {hintOpen ? t("learn.coach.hideHint") : t("learn.coach.hint")}
              </Button>
            )}
            {step?.goal.kind !== TutorialGoalKind.ACKNOWLEDGE.value ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCelebrating(false);
                  advance();
                }}
              >
                {t("learn.coach.skip")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <button type="button" className="tutorial-coach__restart" onClick={() => onStartLesson(lesson.id)}>
          <Icons.RotateCcw size={14} />
          {t("learn.coach.restart")}
        </button>
      </TutorialCoachWindow>
      {!minimized && highlightElement ? <TutorialSpotlight element={highlightElement} /> : null}
    </>
  );
}
