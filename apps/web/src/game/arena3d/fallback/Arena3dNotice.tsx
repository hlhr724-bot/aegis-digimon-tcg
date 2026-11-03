import { useLayoutEffect, useRef, useState } from "react";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import "@/game/arena3d/fallback/arena3dNotice.css";

type Props = {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

const NOTICE_GAP_PIXELS = 6;

export function Arena3dNotice({ message, retryLabel, onRetry, onDismiss }: Props) {
  const { t } = useTranslation();
  const notice = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const board = notice.current?.closest(".game-board");
    const bar = board?.querySelector<HTMLElement>(".game-opponent-bar");
    if (!board || !bar) {
      return;
    }
    const measure = () =>
      setTop(bar.getBoundingClientRect().bottom - board.getBoundingClientRect().top + NOTICE_GAP_PIXELS);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={notice} className="arena-3d-notice" role="status" style={{ top }}>
      <span className="arena-3d-notice__message">{message}</span>
      {onRetry && retryLabel ? (
        <button type="button" className="arena-3d-notice__retry" onClick={onRetry}>
          <Icons.RotateCcw size={14} aria-hidden="true" />
          {retryLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="arena-3d-notice__dismiss" onClick={onDismiss} aria-label={t("common.close")}>
          <Icons.X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
