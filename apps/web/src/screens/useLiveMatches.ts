import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_MATCH_MAX_PAGE_SIZE, LIVE_MATCH_PAGE_SIZE, type LiveMatchPage } from "@aegis/shared/protocol/LiveMatch";
import { liveMatches } from "@/net/client";

const REFRESH_INTERVAL_MS = 15_000;

export type LiveMatchesState = {
  page: LiveMatchPage | undefined;
  failed: boolean;
  canShowMore: boolean;
  refresh: () => void;
  showMore: () => void;
};

export function useLiveMatches({
  pageSize = LIVE_MATCH_PAGE_SIZE,
  load = liveMatches,
}: {
  pageSize?: number;
  load?: (limit: number) => Promise<LiveMatchPage>;
} = {}): LiveMatchesState {
  const [page, setPage] = useState<LiveMatchPage>();
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    void load(limit)
      .then((next) => {
        if (!mounted.current) return;
        setPage(next);
        setFailed(false);
      })
      .catch(() => {
        if (mounted.current) setFailed(true);
      });
  }, [load, limit]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const canShowMore = page !== undefined && page.total > page.matches.length && limit < LIVE_MATCH_MAX_PAGE_SIZE;
  const showMore = useCallback(
    () => setLimit((current) => Math.min(current + pageSize, LIVE_MATCH_MAX_PAGE_SIZE)),
    [pageSize],
  );

  return { page, failed, canShowMore, refresh, showMore };
}
