import type { AegisRoom } from "@/net/client";
import type { AegisJoinOptions } from "@/net/types";
import type { RankedQueueView } from "@aegis/shared/ranked/RankedContracts";
import { RankedQueueStatus } from "@aegis/shared/ranked/RankedQueueStatus";
import { waitForRankedReservation } from "@/ranked/waitForRankedReservation";

type Params = {
  http: string;
  options: AegisJoinOptions;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  joinRoom: (reservation: RankedQueueView) => Promise<AegisRoom>;
};
type MonitorParams = {
  room: AegisRoom;
  reservation: RankedQueueView;
  endpoint: string;
  signal?: AbortSignal;
  fetcher: typeof fetch;
};

export async function connectRankedMatch({
  http,
  options,
  signal,
  fetcher = fetch,
  joinRoom,
}: Params): Promise<AegisRoom> {
  const searchId = crypto.randomUUID();
  const endpoint = `${http}/ranked/queue?search=${searchId}`;
  let resume = false;
  let room: AegisRoom | undefined;
  try {
    for (;;) {
      const reservation = await waitForRankedReservation({ http, options, signal, fetcher, searchId, resume });
      try {
        room = await joinRoom(reservation);
      } catch (error) {
        signal?.throwIfAborted();
        const response = await fetcher(endpoint, { credentials: "include", signal });
        const current = (await response.json()) as RankedQueueView;
        if (
          response.ok &&
          (current.status === RankedQueueStatus.WAITING.value ||
            (current.status === RankedQueueStatus.RESERVED.value && current.pairId !== reservation.pairId))
        ) {
          resume = true;
          continue;
        }
        throw error;
      }
      const removeMessages = room.onMessage("*", () => {});
      room.send("ready", {});
      let playing: boolean;
      try {
        playing = await monitorReservation({ room, reservation, endpoint, signal, fetcher });
      } finally {
        removeMessages();
      }
      if (playing) {
        return room;
      }
      if (room.connection.isOpen) {
        await room.leave();
      }
      room = undefined;
      resume = true;
    }
  } catch (error) {
    if (room?.connection.isOpen) {
      await room.leave().catch(() => undefined);
    }
    await fetcher(endpoint, { method: "DELETE", credentials: "include", keepalive: true }).catch(() => undefined);
    throw error;
  }
}

function monitorReservation({ room, reservation, endpoint, signal, fetcher }: MonitorParams): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let stopped = false;
    let polling = false;
    function finish(result: boolean, error?: unknown) {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(timer);
      room.onStateChange.remove(onState);
      signal?.removeEventListener("abort", abort);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }
    function onState() {
      if (room.state?.rankedDeadlineAt > 0) {
        finish(true);
      }
    }
    function abort() {
      finish(false, new DOMException("Aborted", "AbortError"));
    }
    async function poll() {
      if (stopped || polling) {
        return;
      }
      polling = true;
      try {
        const response = await fetcher(endpoint, { credentials: "include", signal });
        if (!response.ok) {
          throw new Error("ranked_queue_failed");
        }
        const current = (await response.json()) as RankedQueueView;
        if (
          current.status === RankedQueueStatus.WAITING.value ||
          (current.status === RankedQueueStatus.RESERVED.value && current.pairId !== reservation.pairId)
        ) {
          finish(false);
        } else if (
          current.status !== RankedQueueStatus.RESERVED.value &&
          current.status !== RankedQueueStatus.PLAYING.value
        ) {
          finish(false, new Error("ranked_queue_expired"));
        }
      } catch (error) {
        finish(false, error);
      } finally {
        polling = false;
      }
    }
    const timer = setInterval(() => void poll(), 2000);
    room.onStateChange(onState);
    signal?.addEventListener("abort", abort, { once: true });
    onState();
    if (signal?.aborted) {
      abort();
    }
  });
}
