import { useEffect, useState, type RefObject } from "react";

export function useContentBelow(listRef: RefObject<HTMLElement | null>, revision: number): boolean {
  const [contentBelow, setContentBelow] = useState(false);
  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      setContentBelow(false);
      return;
    }
    const measure = () => setContentBelow(list.scrollHeight - list.clientHeight - list.scrollTop > 1);
    measure();
    list.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined;
    observer?.observe(list);
    return () => {
      list.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [listRef, revision]);
  return contentBelow;
}
