import type { ReplayAnnotations } from "@aegis/shared/replays/annotations/ReplayAnnotations";
import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";
import { request } from "@/account/client";

type MarkerInput = { frameIndex: number; turn: number; emoji: ReplayMarkerEmoji };

const annotationsPath = (matchId: string) => `/replay-annotations/${encodeURIComponent(matchId)}`;

export const replayAnnotationApi = {
  list: (matchId: string) => request<ReplayAnnotations>(annotationsPath(matchId)),
  addMarker: (matchId: string, input: MarkerInput) =>
    request<ReplayMarker>(`${annotationsPath(matchId)}/markers`, { method: "POST", body: JSON.stringify(input) }),
  removeMarker: (matchId: string, markerId: string) =>
    request<{ ok: true }>(`${annotationsPath(matchId)}/markers/${encodeURIComponent(markerId)}`, {
      method: "DELETE",
    }),
};
