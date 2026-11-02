import { useCallback, useEffect, useState } from "react";
import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";
import { replayAnnotationApi } from "@/replays/annotations/replayAnnotationApi";

type Params = { matchId: string };
type MarkMomentParams = { frameIndex: number; turn: number; emoji: ReplayMarkerEmoji };

export type ReplayAnnotationsState = {
  markers: readonly ReplayMarker[];
  canAnnotate: boolean;
  failed: boolean;
  markMoment: (params: MarkMomentParams) => Promise<void>;
  removeMarker: (markerId: string) => Promise<void>;
};

function sortMarkers(markers: readonly ReplayMarker[]): ReplayMarker[] {
  return [...markers].sort(
    (first, second) => first.frameIndex - second.frameIndex || first.createdAt - second.createdAt,
  );
}

export function useReplayAnnotations({ matchId }: Params): ReplayAnnotationsState {
  const [markers, setMarkers] = useState<readonly ReplayMarker[]>([]);
  const [canAnnotate, setCanAnnotate] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setMarkers([]);
    setCanAnnotate(false);
    replayAnnotationApi
      .list(matchId)
      .then((annotations) => {
        if (active) {
          setMarkers(sortMarkers(annotations.markers));
          setCanAnnotate(annotations.canAnnotate);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [matchId]);

  const markMoment = useCallback(
    async (params: MarkMomentParams) => {
      setFailed(false);
      try {
        const marker = await replayAnnotationApi.addMarker(matchId, params);
        setMarkers((current) => sortMarkers([...current, marker]));
      } catch {
        setFailed(true);
      }
    },
    [matchId],
  );

  const removeMarker = useCallback(
    async (markerId: string) => {
      setFailed(false);
      try {
        await replayAnnotationApi.removeMarker(matchId, markerId);
        setMarkers((current) => current.filter((marker) => marker.id !== markerId));
      } catch {
        setFailed(true);
      }
    },
    [matchId],
  );

  return { markers, canAnnotate, failed, markMoment, removeMarker };
}
