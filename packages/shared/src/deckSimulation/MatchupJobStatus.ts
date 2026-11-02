export const MatchupJobStatus = {
  QUEUED: { name: "QUEUED", value: "queued", isFinished: false },
  RUNNING: { name: "RUNNING", value: "running", isFinished: false },
  COMPLETED: { name: "COMPLETED", value: "completed", isFinished: true },
  TIMED_OUT: { name: "TIMED_OUT", value: "timed-out", isFinished: true },
  FAILED: { name: "FAILED", value: "failed", isFinished: true },
} as const;

export type MatchupJobStatus = (typeof MatchupJobStatus)[keyof typeof MatchupJobStatus]["value"];
