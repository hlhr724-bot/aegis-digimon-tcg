import { useCallback, useEffect, useState } from "react";
import {
  LIVE_REPLAY_ANNOTATION_CHANNEL,
  type LiveReplayAnnotationRequest,
  type LiveReplayAnnotationResult,
} from "@aegis/shared/replays/annotations/LiveReplayAnnotation";
import type { AegisRoom } from "@/net/client";

type Params = { room: AegisRoom | undefined };

export type LiveReplayAnnotations = {
  send: ((request: LiveReplayAnnotationRequest) => void) | undefined;
  lastResult: LiveReplayAnnotationResult | undefined;
};

export function useLiveReplayAnnotations({ room }: Params): LiveReplayAnnotations {
  const [lastResult, setLastResult] = useState<LiveReplayAnnotationResult>();

  useEffect(() => {
    setLastResult(undefined);
    if (!room) {
      return;
    }
    return room.onMessage<LiveReplayAnnotationResult>(LIVE_REPLAY_ANNOTATION_CHANNEL, setLastResult);
  }, [room]);

  const send = useCallback(
    (request: LiveReplayAnnotationRequest) => {
      if (room?.connection?.isOpen) {
        room.send(LIVE_REPLAY_ANNOTATION_CHANNEL, request);
      }
    },
    [room],
  );

  return { send: room ? send : undefined, lastResult };
}
