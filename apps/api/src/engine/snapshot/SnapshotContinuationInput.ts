import type { Intent } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";

export type SnapshotContinuationInput =
  | { kind: "intent"; seat: Seat; intent: Intent; events: number }
  | { kind: "expireCombatWindow"; events: number }
  | { kind: "expireMatchTimer"; seat: Seat; events: number }
  | { kind: "disconnect"; seat: Seat; consented: boolean; events: number }
  | { kind: "reconnect"; seat: Seat; events: number };
