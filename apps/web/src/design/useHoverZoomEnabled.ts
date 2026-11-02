import { useEffect, useState } from "react";
import { useHoverZoomPreference } from "@/design/useHoverZoomPreference";

export function useHoverZoomEnabled(): boolean {
  const preferred = useHoverZoomPreference();
  const [finePointer, setFinePointer] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFinePointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return preferred && finePointer;
}
