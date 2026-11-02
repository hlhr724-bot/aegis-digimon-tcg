import { useLayoutEffect, useRef, useState } from "react";

type Params = { factor: number };

export function useArenaViewport({ factor }: Params) {
  const ref = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || factor === 1) {
      return;
    }
    function measure() {
      if (element) {
        setHeight(element.clientHeight);
      }
    }
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [factor]);
  return { ref, minHeight: height > 0 && factor > 1 ? Math.round(height * factor) : undefined };
}
