import type { ReplayAnnotations } from "@aegis/shared/replays/annotations/ReplayAnnotations";
import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayNote } from "@aegis/shared/replays/annotations/ReplayNote";
import { request } from "@/account/client";

type MarkerInput = { frameIndex: number; turn: number; emoji: string };
type NoteInput = { frameIndex: number; turn: number; text: string };

const annotationsPath = (matchId: string) => `/replay-annotations/${encodeURIComponent(matchId)}`;
const itemPath = (matchId: string, kind: "markers" | "notes", id: string) =>
  `${annotationsPath(matchId)}/${kind}/${encodeURIComponent(id)}`;

export const replayAnnotationApi = {
  list: (matchId: string) => request<ReplayAnnotations>(annotationsPath(matchId)),
  addMarker: (matchId: string, input: MarkerInput) =>
    request<ReplayMarker>(`${annotationsPath(matchId)}/markers`, { method: "POST", body: JSON.stringify(input) }),
  removeMarker: (matchId: string, markerId: string) =>
    request<{ ok: true }>(itemPath(matchId, "markers", markerId), { method: "DELETE" }),
  addNote: (matchId: string, input: NoteInput) =>
    request<ReplayNote>(`${annotationsPath(matchId)}/notes`, { method: "POST", body: JSON.stringify(input) }),
  updateNote: (matchId: string, noteId: string, text: string) =>
    request<ReplayNote>(itemPath(matchId, "notes", noteId), { method: "PATCH", body: JSON.stringify({ text }) }),
  removeNote: (matchId: string, noteId: string) =>
    request<{ ok: true }>(itemPath(matchId, "notes", noteId), { method: "DELETE" }),
};
