import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { useDraggableWindow, type WindowPosition } from "../../chat/useDraggableWindow";
import { takeViewBoardOrigin } from "@/game/overlay/choice/takeViewBoardOrigin";
import { readDecisionReturnPosition } from "@/game/overlay/choice/readDecisionReturnPosition";
import { saveDecisionReturnPosition } from "@/game/overlay/choice/saveDecisionReturnPosition";
import { PromptMoveHandle } from "./PromptMoveHandle";

const VIEWPORT_MARGIN_PX = 16;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Stands in for the decision panel while the player is looking at the board. The game
 * overlays normally live inside #aegis-stage, which is itself a fixed, overflow-clipped
 * viewport. Mobile browsers can therefore clip a fixed descendant after the board fills
 * 100dvh. Keep the only route back to the pending decision in the document viewport.
 */
export type DecisionBoardReturnSelection = {
  status: string;
  confirmLabel: string;
  canConfirm: boolean;
  onConfirm: () => void;
};

export function DecisionBoardReturn({
  returnControlRef,
  onReturn,
  selection,
}: {
  returnControlRef: RefObject<HTMLDivElement | null>;
  onReturn: () => void;
  selection?: DecisionBoardReturnSelection;
}) {
  const { t } = useTranslation();
  const [origin] = useState(takeViewBoardOrigin);
  const [saved, setSaved] = useState(readDecisionReturnPosition);
  const [dock, setDock] = useState<WindowPosition>();
  const drag = useDraggableWindow(returnControlRef, { viewportGutter: VIEWPORT_MARGIN_PX });
  const previousDragPosition = useRef(drag.position);

  useEffect(() => {
    if (drag.position) saveDecisionReturnPosition(drag.position);
    else if (previousDragPosition.current) {
      saveDecisionReturnPosition(undefined);
      setSaved(undefined);
    }
    previousDragPosition.current = drag.position;
  }, [drag.position]);

  useLayoutEffect(() => {
    const control = returnControlRef.current;
    if (!control) return;
    const { width, height } = control.getBoundingClientRect();
    const preferred = saved ?? (origin ? { left: VIEWPORT_MARGIN_PX, top: origin.y - height / 2 } : undefined);
    setDock(
      preferred && {
        left: clamp(preferred.left, VIEWPORT_MARGIN_PX, window.innerWidth - width - VIEWPORT_MARGIN_PX),
        top: clamp(preferred.top, VIEWPORT_MARGIN_PX, window.innerHeight - height - VIEWPORT_MARGIN_PX),
      },
    );
  }, [origin, saved, returnControlRef]);

  const returnControl = (
    <div
      ref={returnControlRef}
      className={`decision-board-return${selection ? " decision-board-return--selection" : ""}`}
      data-docked={dock ? "" : undefined}
      data-dragged={drag.position ? "" : undefined}
      style={
        {
          position: "fixed",
          zIndex: "calc(var(--ds-z-toast, 110) - 1)",
          ...(dock
            ? { "--decision-return-left": `${dock.left}px`, "--decision-return-top": `${dock.top}px` }
            : { right: 16, top: "calc(env(safe-area-inset-top, 0px) + 64px)", bottom: "auto" }),
          ...(drag.position
            ? {
                "--decision-return-drag-left": `${drag.position.left}px`,
                "--decision-return-drag-top": `${drag.position.top}px`,
              }
            : {}),
        } as CSSProperties
      }
    >
      <span className="decision-board-return__status" aria-live="polite">
        {selection?.status ?? t("overlay.decisionPending")}
      </span>
      <Button
        variant={selection ? "secondary" : undefined}
        icon={Icons.ArrowLeft}
        aria-label={t("overlay.returnToDecision")}
        data-arena-cancel
        onClick={onReturn}
      >
        <span className="decision-board-return__label">{t("overlay.returnToDecision")}</span>
      </Button>
      {selection ? (
        <Button icon={Icons.Check} disabled={!selection.canConfirm} onClick={selection.onConfirm}>
          {selection.confirmLabel}
        </Button>
      ) : null}
      <PromptMoveHandle
        drag={drag}
        className="decision-board-return__move-handle"
        label={t("overlay.moveReturnToDecision")}
      />
    </div>
  );
  return typeof document === "undefined" ? returnControl : createPortal(returnControl, document.body);
}
