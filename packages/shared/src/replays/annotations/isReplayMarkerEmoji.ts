import { REPLAY_MARKER_EMOJI_MAX_LENGTH } from "#shared/replays/annotations/replayAnnotationLimits";

const emojiCodePoints = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component})+$/u;
const pictograph = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|⃣/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function isReplayMarkerEmoji(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > REPLAY_MARKER_EMOJI_MAX_LENGTH) {
    return false;
  }
  if (!emojiCodePoints.test(value) || !pictograph.test(value)) {
    return false;
  }
  return Array.from(graphemes.segment(value)).length === 1;
}
