import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icons } from "@/design/icons";
import { useDraggableWindow } from "@/game/chat/useDraggableWindow";
import { useTranslation } from "@/i18n/useTranslation";

type Params = {
  compact: boolean;
  counter: string;
  celebrating: boolean;
  onToggle: () => void;
  children: ReactNode;
};

const movement: Record<string, [number, number]> = {
  ArrowLeft: [-20, 0],
  ArrowRight: [20, 0],
  ArrowUp: [0, -20],
  ArrowDown: [0, 20],
};

export function TutorialCoachWindow({ compact, counter, celebrating, onToggle, children }: Params) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLElement>(null);
  const contentId = useId();
  const drag = useDraggableWindow(panelRef, { viewportGutter: 8 });

  function handleMove(event: KeyboardEvent<HTMLButtonElement>) {
    const step = movement[event.key];
    if (step) {
      event.preventDefault();
      drag.moveBy(...step);
    } else if (event.key === "Home") {
      event.preventDefault();
      drag.resetPosition();
    }
  }

  return (
    <aside
      ref={panelRef}
      className={`tutorial-coach${compact ? " tutorial-coach--chip" : ""}`}
      aria-label={t("learn.coach.region")}
      data-moved={drag.position ? true : undefined}
      style={drag.position ? { left: drag.position.left, top: drag.position.top } : undefined}
    >
      <header className="tutorial-coach__head">
        <button
          {...drag.handleProps}
          type="button"
          className="tutorial-coach__move"
          aria-label={t("learn.coach.move")}
          title={t("learn.coach.moveHelp")}
          onKeyDown={handleMove}
        >
          <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
            {[5, 10, 15].flatMap((y) => [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />))}
          </svg>
        </button>
        <button
          type="button"
          className="tutorial-coach__toggle"
          onClick={onToggle}
          aria-label={compact ? t("learn.coach.expand") : t("learn.coach.collapse")}
          aria-expanded={!compact}
          aria-controls={contentId}
        >
          {compact ? <Icons.Lightbulb size={16} /> : <Icons.Minimize size={16} />}
          <span>{compact ? t("learn.coach.region") : t("learn.coach.collapse")}</span>
          {compact ? <span className="tutorial-coach__counter">{counter}</span> : null}
        </button>
      </header>
      <div id={contentId} className="tutorial-coach__body" hidden={compact}>
        <div className="tutorial-coach__status">
          <span className="tutorial-coach__counter">{counter}</span>
          {celebrating ? (
            <span className="tutorial-coach__done">
              <Icons.CircleCheck size={14} />
              {t("learn.coach.done")}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </aside>
  );
}
