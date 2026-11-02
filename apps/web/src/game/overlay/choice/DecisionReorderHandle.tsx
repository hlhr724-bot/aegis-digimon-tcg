import { useRef, useState, type ButtonHTMLAttributes } from "react";
import { useTranslation } from "@/i18n/useTranslation";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  position: number;
  onMove: (delta: -1 | 1) => void;
  onRestore: (position: number) => void;
  onCancel: () => void;
};

export function DecisionReorderHandle({ position, onMove, onRestore, onCancel, ...pointerProps }: Props) {
  const { t } = useTranslation();
  const [grabbed, setGrabbed] = useState(false);
  const origin = useRef(position);
  return (
    <button
      {...pointerProps}
      type="button"
      className="decision-reorder-handle"
      data-arena-reordering={grabbed || undefined}
      aria-pressed={grabbed}
      aria-label={t("overlay.reorderItem", { position })}
      title={t("game.input.reorder")}
      onPointerDown={(event) => {
        setGrabbed(false);
        pointerProps.onPointerDown?.(event);
      }}
      onClick={(event) => {
        if (event.detail > 0) {
          return;
        }
        if (!grabbed) {
          origin.current = position;
        }
        setGrabbed(!grabbed);
      }}
      onKeyDown={(event) => {
        if (!grabbed) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (position !== origin.current) {
            onRestore(origin.current);
          }
          setGrabbed(false);
          onCancel();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          onMove(event.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <svg width="18" height="24" viewBox="0 0 18 24" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="6" r="1.5" />
        <circle cx="12" cy="6" r="1.5" />
        <circle cx="6" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="6" cy="18" r="1.5" />
        <circle cx="12" cy="18" r="1.5" />
      </svg>
    </button>
  );
}
