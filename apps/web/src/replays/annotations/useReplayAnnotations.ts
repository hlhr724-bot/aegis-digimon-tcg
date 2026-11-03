import { useCallback, useEffect, useState } from "react";
import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayNote } from "@aegis/shared/replays/annotations/ReplayNote";
import { replayAnnotationApi } from "@/replays/annotations/replayAnnotationApi";

type Params = { matchId: string };
type Moment = { frameIndex: number; turn: number };
type MarkMomentParams = Moment & { emoji: string };
type AddNoteParams = Moment & { text: string };
type EditNoteParams = { noteId: string; text: string };

export type ReplayAnnotationsState = {
  markers: readonly ReplayMarker[];
  notes: readonly ReplayNote[];
  canAnnotate: boolean;
  ownReplayIds: readonly string[];
  failed: boolean;
  markMoment: (params: MarkMomentParams) => Promise<void>;
  removeMarker: (markerId: string) => Promise<void>;
  addNote: (params: AddNoteParams) => Promise<boolean>;
  editNote: (params: EditNoteParams) => Promise<boolean>;
  removeNote: (noteId: string) => Promise<void>;
};

export function useReplayAnnotations({ matchId }: Params): ReplayAnnotationsState {
  const [markers, setMarkers] = useState<readonly ReplayMarker[]>([]);
  const [notes, setNotes] = useState<readonly ReplayNote[]>([]);
  const [canAnnotate, setCanAnnotate] = useState(false);
  const [ownReplayIds, setOwnReplayIds] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setMarkers([]);
    setNotes([]);
    setCanAnnotate(false);
    setOwnReplayIds([]);
    replayAnnotationApi
      .list(matchId)
      .then((annotations) => {
        if (active) {
          setMarkers(annotations.markers);
          setNotes(annotations.notes);
          setCanAnnotate(annotations.canAnnotate);
          setOwnReplayIds(annotations.ownReplayIds);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [matchId]);

  const attempt = useCallback(async (work: () => Promise<void>) => {
    setFailed(false);
    try {
      await work();
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }, []);

  const markMoment = useCallback(
    async (params: MarkMomentParams) => {
      await attempt(async () => {
        const marker = await replayAnnotationApi.addMarker(matchId, params);
        setMarkers((current) => [...current, marker]);
      });
    },
    [attempt, matchId],
  );

  const removeMarker = useCallback(
    async (markerId: string) => {
      await attempt(async () => {
        await replayAnnotationApi.removeMarker(matchId, markerId);
        setMarkers((current) => current.filter((marker) => marker.id !== markerId));
      });
    },
    [attempt, matchId],
  );

  const addNote = useCallback(
    (params: AddNoteParams) =>
      attempt(async () => {
        const note = await replayAnnotationApi.addNote(matchId, params);
        setNotes((current) => [...current, note]);
      }),
    [attempt, matchId],
  );

  const editNote = useCallback(
    ({ noteId, text }: EditNoteParams) =>
      attempt(async () => {
        const note = await replayAnnotationApi.updateNote(matchId, noteId, text);
        setNotes((current) => current.map((entry) => (entry.id === noteId ? note : entry)));
      }),
    [attempt, matchId],
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      await attempt(async () => {
        await replayAnnotationApi.removeNote(matchId, noteId);
        setNotes((current) => current.filter((note) => note.id !== noteId));
      });
    },
    [attempt, matchId],
  );

  return {
    markers,
    notes,
    canAnnotate,
    ownReplayIds,
    failed,
    markMoment,
    removeMarker,
    addNote,
    editNote,
    removeNote,
  };
}
