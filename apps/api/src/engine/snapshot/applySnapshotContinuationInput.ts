import type { GameEngine } from "#api/engine/GameEngine";
import type { SnapshotContinuationInput } from "#api/engine/snapshot/SnapshotContinuationInput";
import { SnapshotContinuationInputKind } from "#api/engine/snapshot/SnapshotContinuationInputKind";

type Params = { engine: GameEngine; input: SnapshotContinuationInput };

export function applySnapshotContinuationInput({ engine, input }: Params): void {
  switch (input.kind) {
    case SnapshotContinuationInputKind.INTENT.value:
      engine.applyIntent(input.seat, structuredClone(input.intent));
      return;
    case SnapshotContinuationInputKind.EXPIRE_COMBAT_WINDOW.value:
      engine.expireCombatWindow();
      return;
    case SnapshotContinuationInputKind.EXPIRE_MATCH_TIMER.value:
      engine.expireMatchTimer(input.seat);
      return;
    case SnapshotContinuationInputKind.DISCONNECT.value:
      engine.handleDisconnect(input.seat, input.consented);
      return;
    case SnapshotContinuationInputKind.RECONNECT.value:
      engine.handleReconnect(input.seat);
      return;
  }
}
