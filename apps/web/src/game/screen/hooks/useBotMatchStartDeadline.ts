import { useEffect, useRef } from "react";

const BOT_MATCH_START_DEADLINE_MS = 20_000;

export function useBotMatchStartDeadline({ waiting, onExpired }: { waiting: boolean; onExpired: () => void }): void {
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (!waiting) return;
    const deadline = setTimeout(() => onExpiredRef.current(), BOT_MATCH_START_DEADLINE_MS);
    return () => clearTimeout(deadline);
  }, [waiting]);
}
