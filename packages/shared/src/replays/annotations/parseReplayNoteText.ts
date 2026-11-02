import { normalizeReplayNoteText } from "#shared/replays/annotations/normalizeReplayNoteText";
import { REPLAY_NOTE_MAX_LENGTH } from "#shared/replays/annotations/replayAnnotationLimits";

export function parseReplayNoteText(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > REPLAY_NOTE_MAX_LENGTH * 4) {
    return undefined;
  }
  const text = normalizeReplayNoteText(value);
  if (!text || Array.from(text).length > REPLAY_NOTE_MAX_LENGTH) {
    return undefined;
  }
  return text;
}
