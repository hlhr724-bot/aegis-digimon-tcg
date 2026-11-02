import type { Seat } from "@aegis/shared/schema/enums";

export type TurnPhaseFrame = {
  seat: Seat;
  turnCount: number;
  activePhaseCompleted: boolean;
  drawPhaseRan: boolean;
  breedingPhaseRan: boolean;
  mainPhaseRan: boolean;
  endWindowsRun: number;
};
