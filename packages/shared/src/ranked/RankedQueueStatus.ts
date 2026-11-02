export const RankedQueueStatus = {
  IDLE: { name: "IDLE", value: "idle" },
  WAITING: { name: "WAITING", value: "waiting" },
  RESERVED: { name: "RESERVED", value: "reserved" },
  PLAYING: { name: "PLAYING", value: "playing" },
  FINISHED: { name: "FINISHED", value: "finished" },
  VOID: { name: "VOID", value: "void" },
} as const;

export type RankedQueueStatus = (typeof RankedQueueStatus)[keyof typeof RankedQueueStatus]["value"];
