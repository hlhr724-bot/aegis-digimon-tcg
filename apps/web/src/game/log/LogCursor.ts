import type { Phase, Seat } from "@aegis/shared/schema/enums";
import type { LogEntry } from "@/game/log/LogEntry";

export interface PendingLogMemory {
  from: number;
  to: number;
  seq?: number;
  turnCount: number;
  turnSeat: Seat;
  phase: Phase;
  sourceCardId?: string;
}

export interface LogCursor {
  entries: LogEntry[];
  identities: Map<string, string>;
  turnCount: number;
  turnSeat: Seat;
  phase: Phase;
  lastSeq: number;
  currentBatch?: string;
  pendingMemory?: PendingLogMemory;
  currentEffectSourceCardId?: string;
}
