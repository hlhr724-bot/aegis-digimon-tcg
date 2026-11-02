import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "@/i18n";

type Position = { x: number; y: number };
type Props = { children: ReactNode; visible: boolean };

export function ReplayControls({ children, visible }: Props) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const [position, setPosition] = useState<Position>();

  function movePanel(next: Position) {
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    setPosition({
      x: Math.max(12, Math.min(next.x, window.innerWidth - bounds.width - 12)),
      y: Math.max(12, Math.min(next.y, window.innerHeight - bounds.height - 12)),
    });
  }

  useEffect(() => {
    function constrainPanel() {
      const bounds = panel.current?.getBoundingClientRect();
      if (!bounds || !bounds.width || !bounds.height) {
        return;
      }
      setPosition(
        (current) =>
          current && {
            x: Math.max(12, Math.min(current.x, window.innerWidth - bounds.width - 12)),
            y: Math.max(12, Math.min(current.y, window.innerHeight - bounds.height - 12)),
          },
      );
    }
    const resize = new ResizeObserver(constrainPanel);
    if (panel.current) {
      resize.observe(panel.current);
    }
    window.addEventListener("resize", constrainPanel);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", constrainPanel);
    };
  }, []);

  const below = position !== undefined && position.y < window.innerHeight / 2;
  const style: CSSProperties & { "--replay-options-height"?: string } = {};
  if (position) {
    style.left = position.x;
    style.top = position.y;
    style.bottom = "auto";
    const height = panel.current?.getBoundingClientRect().height ?? 120;
    style["--replay-options-height"] =
      `${Math.max(44, below ? window.innerHeight - position.y - height - 24 : position.y - 24)}px`;
  }

  return (
    <div
      ref={panel}
      id="replay-controls"
      className="replay-controls"
      role="group"
      aria-label={t("replay.title")}
      hidden={!visible}
      style={style}
      data-options-below={below || undefined}
    >
      <button
        type="button"
        className="replay-controls__move"
        aria-label={t("replay.move")}
        title={t("replay.moveHint")}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          const bounds = panel.current!.getBoundingClientRect();
          drag.current = { pointerId: event.pointerId, x: event.clientX - bounds.x, y: event.clientY - bounds.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId !== event.pointerId) {
            return;
          }
          movePanel({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
        onLostPointerCapture={() => {
          drag.current = undefined;
        }}
        onKeyDown={(event) => {
          if (event.key === "Home") {
            event.preventDefault();
            setPosition(undefined);
            return;
          }
          const bounds = panel.current!.getBoundingClientRect();
          const step = event.shiftKey ? 48 : 16;
          let x = bounds.x;
          let y = bounds.y;
          if (event.key === "ArrowLeft") {
            x -= step;
          } else if (event.key === "ArrowRight") {
            x += step;
          } else if (event.key === "ArrowUp") {
            y -= step;
          } else if (event.key === "ArrowDown") {
            y += step;
          } else {
            return;
          }
          event.preventDefault();
          movePanel({ x, y });
        }}
      >
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </button>
      {children}
    </div>
  );
}
