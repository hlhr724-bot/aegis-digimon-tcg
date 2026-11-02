import type { KeyboardEvent } from "react";
import { useTranslation } from "../../../i18n";
import type { useDraggableWindow } from "../../chat/useDraggableWindow";

const KEYBOARD_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-20, 0],
  ArrowRight: [20, 0],
  ArrowUp: [0, -20],
  ArrowDown: [0, 20],
};

type PromptMoveHandleProps = {
  drag: ReturnType<typeof useDraggableWindow>;
  className: string;
  tabIndex?: number;
  label?: string;
};

export function PromptMoveHandle({ drag, className, tabIndex, label }: PromptMoveHandleProps) {
  const { t } = useTranslation();
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = KEYBOARD_STEPS[event.key];
    if (step) {
      event.preventDefault();
      drag.moveBy(...step);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      drag.resetPosition();
    }
  }
  return (
    <button
      {...drag.handleProps}
      type="button"
      className={className}
      tabIndex={tabIndex}
      aria-label={label ?? t("overlay.moveEffectPrompt")}
      title={t("overlay.moveEffectPromptHelp")}
      onKeyDown={handleKeyDown}
    >
      <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
        {[5, 10, 15].flatMap((y) => [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />))}
      </svg>
    </button>
  );
}
