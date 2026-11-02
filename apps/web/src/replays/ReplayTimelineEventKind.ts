export const ReplayTimelineEventKind = {
  TURN: { name: "TURN", value: "turn", label: "replay.timeline.turn" },
  SECURITY: { name: "SECURITY", value: "security", label: "replay.timeline.security" },
} as const;

export type ReplayTimelineEventKind = (typeof ReplayTimelineEventKind)[keyof typeof ReplayTimelineEventKind]["value"];
