/* The card that follows the pointer while it is held, and the name of the intent the
   area under it would send. Both are portalled to the document body so no board
   overflow can clip them, and the label is floated clear of the ghost and of the
   finger holding it. */

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../../i18n";
import { CardFull } from "../../../design/cards";
import { dragIntentLabelKey, dragIntentLabelOffsetPx, type DragIntent } from "../../dragIntents";
import type { DragPointer } from "../hooks/createDragPointer";

export function DragGhost({
  cardId,
  artId,
  pointer,
  intent,
  coarsePointer,
}: {
  cardId: string;
  artId?: string;
  pointer: DragPointer;
  /** What releasing here would do, or nothing while the pointer is over no drop area. */
  intent: DragIntent | undefined;
  coarsePointer: boolean;
}) {
  const { t } = useTranslation();
  const { x, y } = useSyncExternalStore(pointer.subscribe, pointer.get);
  return (
    <>
      {createPortal(
        <div
          data-testid="drag-ghost"
          style={{
            position: "fixed",
            left: x,
            top: y,
            transform: "translate(-50%, -52%) rotate(-4deg)",
            pointerEvents: "none",
            zIndex: 9999,
            opacity: 0.95,
            filter: "drop-shadow(0 18px 30px rgba(15,23,42,0.4))",
          }}
        >
          <CardFull cardId={cardId} artId={artId} width={124} />
        </div>,
        document.body,
      )}
      {intent
        ? createPortal(
            <span
              className="game-drag-intent"
              data-intent={intent}
              style={{ left: x, top: y - dragIntentLabelOffsetPx(coarsePointer) }}
            >
              {t(dragIntentLabelKey(intent))}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
