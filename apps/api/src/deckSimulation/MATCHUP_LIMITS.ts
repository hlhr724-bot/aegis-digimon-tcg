export const MATCHUP_LIMITS = {
  activeJobsPerAccount: 1,
  queuedJobs: 2,
  workerHeapMb: 512,
  timeBudgetMs: 120_000,
  hungWorkerGraceMs: 15_000,
  sampleReplays: 3,
  finishedJobTtlMs: 15 * 60_000,
  idleWorkerMs: 60_000,
  busyHostRetryMs: 2_000,
  busyHostLoadPerCore: 1.5,
  startsPerAccount: { capacity: 6, refillMs: 10 * 60_000 },
} as const;
