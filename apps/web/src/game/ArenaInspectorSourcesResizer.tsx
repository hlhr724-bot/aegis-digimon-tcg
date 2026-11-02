import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import { useInspectorSourcesWidth } from "@/game/useInspectorSourcesWidth";

const KEYBOARD_STEP = 16;

export function ArenaInspectorSourcesResizer() {
  const { t } = useTranslation();
  const { width, minWidth, maxWidth, defaultWidth, setWidth } = useInspectorSourcesWidth();
  const dragStart = useRef<{ pointerX: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerX: event.clientX, width };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (start) setWidth(start.width + event.clientX - start.pointerX, false);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStart.current = null;
    setDragging(false);
    setWidth(width);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowLeft: width - KEYBOARD_STEP,
      ArrowRight: width + KEYBOARD_STEP,
      Home: maxWidth,
      End: minWidth,
    }[event.key];
    if (next == null) return;
    event.preventDefault();
    setWidth(next);
  };

  return (
    <div
      className="arena-permanent-inspector__resizer"
      data-dragging={dragging}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("overlay.sourcesResize")}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      title={t("overlay.sourcesResize")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setWidth(defaultWidth)}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true" />
    </div>
  );
}
