import type { Phase, Seat } from "@aegis/shared/schema/enums";
import type { LogEffectRole } from "@/game/log/LogEffectRole";

export type LogKind = "you" | "opp" | "sys";
export interface LogMemory {
  delta: number;
  after: number;
}
export interface LogLine {
  text: string;
  kind: LogKind;
  cardIds?: readonly string[];
  memory?: LogMemory;
}
export interface LogEntry extends LogLine {
  id: string;
  seq?: number;
  turnCount: number;
  turnSeat: Seat;
  phase: Phase;
  actorSeat?: Seat;
  effectRole?: LogEffectRole;
}
export interface LogPhaseGroup {
  phase: Phase;
  entries: readonly LogEntry[];
}
export interface LogTurnGroup {
  turnCount: number;
  turnSeat: Seat;
  phases: readonly LogPhaseGroup[];
}
