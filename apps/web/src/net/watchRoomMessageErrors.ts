import { CloseCode } from "@colyseus/sdk";
import type { AegisRoom } from "@/net/client";

type WatchRoomMessageErrorsParams = {
  room: AegisRoom;
  report: (error: Error) => void;
};

export function watchRoomMessageErrors({ room, report }: WatchRoomMessageErrorsParams): () => void {
  const events = room.connection.events;
  const receive = events.onmessage;
  let failed = false;

  function receiveMessage(event: MessageEvent): void {
    if (failed) {
      return;
    }
    try {
      receive?.call(events, event);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Unexpected end of MessagePack data") {
        throw error;
      }
      failed = true;
      try {
        report(error);
      } finally {
        room.connection.close(CloseCode.MAY_TRY_RECONNECT);
      }
    }
  }

  events.onmessage = receiveMessage;
  return () => {
    if (events.onmessage === receiveMessage) {
      events.onmessage = receive;
    }
  };
}
