import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import { PUBLIC_REPLAY_PAGE_SIZE, type PublicReplay, type PublicReplayPage } from "@aegis/shared/replays/PublicReplay";
import { fetchPublicReplays, type PublicReplayRequest } from "@/replays/fetchPublicReplays";

export type PublicReplaysState = {
  replays: PublicReplay[];
  loading: boolean;
  failed: boolean;
  canShowMore: boolean;
  showMore: () => void;
  retry: () => void;
};

type UsePublicReplaysParams = {
  pageSize?: number;
  format?: DeckFormat;
  load?: (request: PublicReplayRequest) => Promise<PublicReplayPage>;
};

export function usePublicReplays({
  pageSize = PUBLIC_REPLAY_PAGE_SIZE,
  format,
  load = fetchPublicReplays,
}: UsePublicReplaysParams = {}): PublicReplaysState {
  const [replays, setReplays] = useState<PublicReplay[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  const loadPage = useCallback(
    (cursor: string | undefined) => {
      const current = ++generation.current;
      setLoading(true);
      setFailed(false);
      void load({ limit: pageSize, cursor, format })
        .then((page) => {
          if (current !== generation.current) {
            return;
          }
          setReplays((previous) => (cursor ? [...previous, ...page.replays] : page.replays));
          setNextCursor(page.nextCursor);
        })
        .catch(() => {
          if (current === generation.current) {
            setFailed(true);
          }
        })
        .finally(() => {
          if (current === generation.current) {
            setLoading(false);
          }
        });
    },
    [load, pageSize, format],
  );

  useEffect(() => {
    setReplays([]);
    setNextCursor(undefined);
    loadPage(undefined);
    return () => {
      generation.current++;
    };
  }, [loadPage, attempt]);

  const showMore = useCallback(() => {
    if (nextCursor) {
      loadPage(nextCursor);
    }
  }, [loadPage, nextCursor]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { replays, loading, failed, canShowMore: nextCursor !== undefined && !loading, showMore, retry };
}
