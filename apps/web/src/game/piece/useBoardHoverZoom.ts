import { useEffect, useState } from "react";
import { useHoverZoomEnabled } from "@/design/useHoverZoomEnabled";

type ZoomPoint = { x: number; y: number };

export function useBoardHoverZoom(hoverKey: string | null): ZoomPoint | null {
  const enabled = useHoverZoomEnabled();
  const active = enabled && hoverKey !== null;
  const [point, setPoint] = useState<ZoomPoint | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const follow = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      setPoint({ x: event.clientX, y: event.clientY });
    };
    const dismiss = () => setDismissed(true);
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("scroll", dismiss, true);
      setPoint(null);
      setDismissed(false);
    };
  }, [active, hoverKey]);

  return active && !dismissed ? point : null;
}
