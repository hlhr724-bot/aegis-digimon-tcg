import type { SnapshotContinuationInput } from "#api/engine/snapshot/SnapshotContinuationInput";

export type SnapshotContinuation = { inputs: readonly SnapshotContinuationInput[]; events: number };
