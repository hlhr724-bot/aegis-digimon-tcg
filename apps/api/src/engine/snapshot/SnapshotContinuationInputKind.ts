export const SnapshotContinuationInputKind = {
  INTENT: { name: "INTENT", value: "intent" },
  EXPIRE_COMBAT_WINDOW: { name: "EXPIRE_COMBAT_WINDOW", value: "expireCombatWindow" },
  EXPIRE_MATCH_TIMER: { name: "EXPIRE_MATCH_TIMER", value: "expireMatchTimer" },
  DISCONNECT: { name: "DISCONNECT", value: "disconnect" },
  RECONNECT: { name: "RECONNECT", value: "reconnect" },
} as const;

export type SnapshotContinuationInputKind =
  (typeof SnapshotContinuationInputKind)[keyof typeof SnapshotContinuationInputKind]["value"];
