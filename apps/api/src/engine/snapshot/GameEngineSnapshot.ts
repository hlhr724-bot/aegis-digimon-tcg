import type { RuntimeGraphSnapshot } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import type { SnapshotContinuation } from "#api/engine/snapshot/SnapshotContinuation";

export type GameEngineSnapshot = {
  version: 1;
  fingerprint: string;
  graph: RuntimeGraphSnapshot;
  continuation?: SnapshotContinuation;
};
