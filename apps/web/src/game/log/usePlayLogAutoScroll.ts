import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Params = { entryCount: number; filtering: boolean };

export function usePlayLogAutoScroll({ entryCount, filtering }: Params) {
  const listRef = useRef<HTMLDivElement>(null);
  const atLatestRef = useRef(true);
  const wasFiltering = useRef(false);
  const previousList = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(-1);
  const [isAtLatest, setIsAtLatest] = useState(true);

  const jumpToLatest = useCallback(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
      atLatestRef.current = true;
      setIsAtLatest(true);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const list = listRef.current;
    if (!list || filtering) {
      return;
    }
    const atLatest = list.scrollHeight - list.scrollTop - list.clientHeight <= 24;
    atLatestRef.current = atLatest;
    setIsAtLatest(atLatest);
  }, [filtering]);

  useLayoutEffect(() => {
    const attached = previousList.current !== listRef.current;
    const changed = previousCount.current !== entryCount;
    if (!filtering && (attached || wasFiltering.current || (changed && atLatestRef.current))) {
      jumpToLatest();
    }
    previousList.current = listRef.current;
    previousCount.current = entryCount;
    wasFiltering.current = filtering;
  });

  return { listRef, isAtLatest, handleScroll, jumpToLatest };
}
