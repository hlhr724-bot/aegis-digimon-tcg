import type { Phase, Seat } from "@aegis/shared/schema/enums";

export interface LogTurnContext {
  turnCount: number;
  turnSeat: Seat;
  phase: Phase;
}
