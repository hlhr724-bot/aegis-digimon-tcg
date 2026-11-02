import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icons } from "@/design/icons";
import { useWheelScrollsHorizontally } from "@/design/useWheelScrollsHorizontally";
import { useTranslation } from "@/i18n/useTranslation";
import { motionPreference } from "@/design/motion/motionPreference";

const PAGE_FRACTION = 0.9;

type DecisionScrollRowParams = {
  className: string;
  children: ReactNode;
};

type ScrollEdges = {
  canScrollBack: boolean;
  canScrollForward: boolean;
};

export function DecisionScrollRow({ className, children }: DecisionScrollRowParams) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  useWheelScrollsHorizontally(rowRef);
  const { canScrollBack, canScrollForward } = useScrollEdges(rowRef);

  function scrollByPage(direction: -1 | 1) {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    row.scrollBy({
      left: direction * row.clientWidth * PAGE_FRACTION,
      behavior: motionPreference.isReduced() ? "auto" : "smooth",
    });
  }

  return (
    <div className="decision-scroll-row">
      <div ref={rowRef} className={className}>
        {children}
      </div>
      {canScrollBack ? (
        <button
          type="button"
          className="decision-scroll-row__button decision-scroll-row__button--back"
          aria-label={t("game.fieldScrollLeft")}
          onClick={() => scrollByPage(-1)}
        >
          <Icons.ChevronLeft size={20} aria-hidden="true" />
        </button>
      ) : null}
      {canScrollForward ? (
        <button
          type="button"
          className="decision-scroll-row__button decision-scroll-row__button--forward"
          aria-label={t("game.fieldScrollRight")}
          onClick={() => scrollByPage(1)}
        >
          <Icons.ChevronRight size={20} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function useScrollEdges(rowRef: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ canScrollBack: false, canScrollForward: false });
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    function measure() {
      if (!row) {
        return;
      }
      const next = {
        canScrollBack: row.scrollLeft > 1,
        canScrollForward: row.scrollWidth - row.clientWidth - row.scrollLeft > 1,
      };
      setEdges((previous) =>
        previous.canScrollBack === next.canScrollBack && previous.canScrollForward === next.canScrollForward
          ? previous
          : next,
      );
    }
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(row);
    for (const child of row.children) {
      observer?.observe(child);
    }
    row.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer?.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, [rowRef]);
  return edges;
}
