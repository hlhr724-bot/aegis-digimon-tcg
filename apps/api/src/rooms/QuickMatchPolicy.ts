export const QuickMatchPolicy = {
  repeatWaitMs: 15_000,
  pollIntervalMs: 500,
  opponentRetentionSeconds: 1800,
  candidateLimit: 16,
  roomLookupTimeoutMs: 250,
} as const;
