import { useCallback, useEffect, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { useHoverZoomEnabled } from "@/design/useHoverZoomEnabled";

type PreviewPoint = { x: number; y: number };

export function useCardHoverPreview() {
  const enabled = useHoverZoomEnabled();
  const [point, setPoint] = useState<PreviewPoint | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPoint = useRef<PreviewPoint | null>(null);
  const hide = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pendingPoint.current = null;
    setPoint(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      hide();
      return;
    }
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, [enabled, hide]);

  function schedule(next: PreviewPoint) {
    if (!enabled) {
      return;
    }
    pendingPoint.current = next;
    if (point) {
      setPoint(next);
    } else if (timer.current === null) {
      timer.current = setTimeout(() => {
        timer.current = null;
        setPoint(pendingPoint.current);
      }, 150);
    }
  }

  function handleMouseEnter(event: MouseEvent<HTMLButtonElement>) {
    schedule({ x: event.clientX, y: event.clientY });
  }

  function handleMouseMove(event: MouseEvent<HTMLButtonElement>) {
    if (pendingPoint.current) {
      schedule({ x: event.clientX, y: event.clientY });
    }
  }

  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    schedule({ x: rect.right, y: rect.top + rect.height / 2 });
  }

  return {
    point: enabled ? point : null,
    hide,
    handlers: {
      onMouseEnter: handleMouseEnter,
      onMouseMove: handleMouseMove,
      onMouseLeave: hide,
      onFocus: handleFocus,
      onBlur: hide,
    },
  };
}
