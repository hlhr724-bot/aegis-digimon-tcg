import type { MatchReplay } from "@aegis/shared/replays";
import type { ReplayAnnotationEntry } from "@/replays/annotations/buildReplayAnnotationEntries";
import { frameDelay, presentationEnd } from "@/replays/playback";

const MIN_CHAPTER_GAP_SECONDS = 10;

type Params = {
  replay: MatchReplay;
  entries: readonly ReplayAnnotationEntry[];
  skipThinking: boolean;
  startLabel: string;
  describe: (entry: ReplayAnnotationEntry) => string;
};
type Chapter = { seconds: number; label: string };

export function buildReplayChapters({ replay, entries, skipThinking, startLabel, describe }: Params): string {
  const offsets = getPlaybackOffsets({ replay, skipThinking });
  const chapters: Chapter[] = [{ seconds: 0, label: startLabel }];
  for (const entry of entries) {
    const frame = Math.min(entry.frameIndex, replay.frames.length - 1);
    const seconds = Math.floor((offsets[frame] ?? 0) / 1000);
    const previous = chapters.at(-1)!;
    if (seconds - previous.seconds < MIN_CHAPTER_GAP_SECONDS) {
      previous.label = `${previous.label} · ${describe(entry)}`;
    } else {
      chapters.push({ seconds, label: describe(entry) });
    }
  }
  return chapters.map((chapter) => `${formatTimestamp(chapter.seconds)} ${chapter.label}`).join("\n");
}

function getPlaybackOffsets({ replay, skipThinking }: Pick<Params, "replay" | "skipThinking">): number[] {
  const offsets = Array.from({ length: replay.frames.length }, () => 0);
  let index = 0;
  let elapsed = 0;
  while (index < replay.frames.length - 1) {
    elapsed += frameDelay(replay, index, 1, skipThinking);
    const next = presentationEnd(replay, index + 1);
    for (let frame = index + 1; frame <= next; frame++) {
      offsets[frame] = elapsed;
    }
    index = next;
  }
  return offsets;
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}
