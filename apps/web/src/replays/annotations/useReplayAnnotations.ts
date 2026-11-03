import { useCallback, useEffect, useState } from "react";
import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayNote } from "@aegis/shared/replays/annotations/ReplayNote";
import type {
  OwnReplayAnnotationSharing,
  SharedReplayAnnotations,
} from "@aegis/shared/replays/annotations/ReplayAnnotations";
import { replayAnnotationApi } from "@/replays/annotations/replayAnnotationApi";

type Params = { matchId: string };
type Moment = { frameIndex: number; turn: number };
type MarkMomentParams = Moment & { emoji: string };
type AddNoteParams = Moment & { text: string };
type EditNoteParams = { noteId: string; text: string };
type SetSharingParams = { replayId: string; shared: boolean };

export type ReplayAnnotationsState = {
  markers: readonly ReplayMarker[];
  notes: readonly ReplayNote[];
  canAnnotate: boolean;
  shared: readonly SharedReplayAnnotations[];
  ownReplays: readonly OwnReplayAnnotationSharing[];
  failed: boolean;
  markMoment: (params: MarkMomentParams) => Promise<void>;
  removeMarker: (markerId: string) => Promise<void>;
  addNote: (params: AddNoteParams) => Promise<boolean>;
  editNote: (params: EditNoteParams) => Promise<boolean>;
  removeNote: (noteId: string) => Promise<void>;
  setSharing: (params: SetSharingParams) => Promise<boolean>;
};

export function useReplayAnnotations({ matchId }: Params): ReplayAnnotationsState {
  const [markers, setMarkers] = useState<readonly ReplayMarker[]>([]);
  const [notes, setNotes] = useState<readonly ReplayNote[]>([]);
  const [canAnnotate, setCanAnnotate] = useState(false);
  const [shared, setShared] = useState<readonly SharedReplayAnnotations[]>([]);
  const [ownReplays, setOwnReplays] = useState<readonly OwnReplayAnnotationSharing[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setMarkers([]);
    setNotes([]);
    setCanAnnotate(false);
    setShared([]);
    setOwnReplays([]);
    replayAnnotationApi
      .list(matchId)
      .then((annotations) => {
        if (active) {
          setMarkers(annotations.markers);
          setNotes(annotations.notes);
          setCanAnnotate(annotations.canAnnotate);
          setShared(annotations.shared);
          setOwnReplays(annotations.ownReplays);
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

  const setSharing = useCallback(
    ({ replayId, shared: next }: SetSharingParams) =>
      attempt(async () => {
        const result = await replayAnnotationApi.setSharing(replayId, next);
        setOwnReplays((current) =>
          current.map((entry) =>
            entry.replayId === replayId ? { ...entry, annotationsShared: result.annotationsShared } : entry,
          ),
        );
      }),
    [attempt],
  );

  return {
    markers,
    notes,
    canAnnotate,
    shared,
    ownReplays,
    failed,
    markMoment,
    removeMarker,
    addNote,
    editNote,
    removeNote,
    setSharing,
  };
}
