export const ReplayMarkerEmoji = {
  KEY_MOMENT: { name: "KEY_MOMENT", value: "⭐", label: "replayAnnotations.emoji.keyMoment" },
  MISTAKE: { name: "MISTAKE", value: "❌", label: "replayAnnotations.emoji.mistake" },
  GREAT_PLAY: { name: "GREAT_PLAY", value: "🔥", label: "replayAnnotations.emoji.greatPlay" },
  QUESTION: { name: "QUESTION", value: "❓", label: "replayAnnotations.emoji.question" },
  IDEA: { name: "IDEA", value: "💡", label: "replayAnnotations.emoji.idea" },
  LUCKY: { name: "LUCKY", value: "🍀", label: "replayAnnotations.emoji.lucky" },
  TURNING_POINT: { name: "TURNING_POINT", value: "🔄", label: "replayAnnotations.emoji.turningPoint" },
  SURPRISE: { name: "SURPRISE", value: "😮", label: "replayAnnotations.emoji.surprise" },
} as const;

export type ReplayMarkerEmoji = (typeof ReplayMarkerEmoji)[keyof typeof ReplayMarkerEmoji]["value"];
