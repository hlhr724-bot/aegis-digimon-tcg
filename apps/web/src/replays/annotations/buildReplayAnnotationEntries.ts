import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayNote } from "@aegis/shared/replays/annotations/ReplayNote";

export type ReplayAnnotationEntry =
  | { kind: "marker"; id: string; frameIndex: number; turn: number; createdAt: number; marker: ReplayMarker }
  | { kind: "note"; id: string; frameIndex: number; turn: number; createdAt: number; note: ReplayNote };

type Params = { markers: readonly ReplayMarker[]; notes: readonly ReplayNote[] };

export function buildReplayAnnotationEntries({ markers, notes }: Params): ReplayAnnotationEntry[] {
  const entries: ReplayAnnotationEntry[] = [
    ...markers.map((marker) => ({ kind: "marker" as const, ...pickMoment(marker), marker })),
    ...notes.map((note) => ({ kind: "note" as const, ...pickMoment(note), note })),
  ];
  return entries.sort((first, second) => first.frameIndex - second.frameIndex || first.createdAt - second.createdAt);
}

function pickMoment({ id, frameIndex, turn, createdAt }: ReplayMarker | ReplayNote) {
  return { id, frameIndex, turn, createdAt };
}
