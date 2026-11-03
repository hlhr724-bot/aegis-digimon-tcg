import { CloseCode } from "@colyseus/sdk";
import type { AegisRoom } from "@/net/client";

const PROBE_INTERVAL_MS = 2_000;
const SILENCE_LIMIT_MS = 6_000;
const STALLED_CHECK_GAP_MS = PROBE_INTERVAL_MS * 2;

const isHidden = () => typeof document !== "undefined" && document.hidden;

export function watchRoomLiveness({ room }: { room: AegisRoom }): () => void {
  let probeSentAt: number | undefined;
  let lastCheckAt = Date.now();

  const probe = () => {
    probeSentAt = Date.now();
    room.ping(() => {
      probeSentAt = undefined;
    });
  };

  const check = () => {
    const now = Date.now();
    const checksWereStalled = now - lastCheckAt > STALLED_CHECK_GAP_MS;
    lastCheckAt = now;
    if (isHidden()) {
      probeSentAt = undefined;
      return;
    }
    if (probeSentAt === undefined || checksWereStalled) {
      probe();
      return;
    }
    if (now - probeSentAt < SILENCE_LIMIT_MS) return;
    stop();
    room.connection.close(CloseCode.MAY_TRY_RECONNECT);
  };

  const probeWhenVisible = () => {
    if (!isHidden()) probe();
  };

  const interval = setInterval(check, PROBE_INTERVAL_MS);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", probeWhenVisible);
  if (typeof window !== "undefined") window.addEventListener("online", probeWhenVisible);

  function stop() {
    clearInterval(interval);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", probeWhenVisible);
    if (typeof window !== "undefined") window.removeEventListener("online", probeWhenVisible);
  }

  return stop;
}
