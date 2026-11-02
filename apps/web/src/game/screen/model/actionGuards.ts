import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { GameMode } from "@aegis/shared/manual/GameMode";
/* What the board will let the viewer do right now.

   Ordinary actions wait for the presented board to catch up, then follow the live match,
   decision, turn and phase guards; effect responses use their own controls and are not
   gated here. The server can reach Breeding or Main while the turn, unsuspend and draw
   ribbons are still queued, so the phase clock has to release those actions explicitly
   rather than the phase alone. */

import { Phase, type GameState, type PlayerState, type Seat } from "@aegis/shared";
import { canAttackWith, canMoveFromBreeding } from "../../boardModel";
import { isBreedingWindow } from "../../turnControl";

export function actionGuards({
  spectating = false,
  state,
  viewer,
  viewerSeat,
  decisionOpen,
  presenting,
  phasePresentationPending,
}: {
  spectating?: boolean;
  state: GameState;
  viewer: PlayerState;
  viewerSeat: Seat;
  /** A decision is open, whether the server's record of it or the viewer's own prompt. */
  decisionOpen: boolean;
  /** The cue queue is still presenting a batch. */
  presenting: boolean;
  /** A turn, phase or unsuspend ribbon is still queued or on screen. */
  phasePresentationPending: boolean;
}) {
  const isMyTurn = !spectating && state.turnSeat === viewerSeat;
  const manual = state.gameMode === GameMode.MANUAL.value;
  const turnActionBlocked =
    state.gameOver ||
    (manual &&
      (state.manual.undoRequester !== -1 ||
        state.manual.resultRequester !== -1 ||
        state.manual.restartRequester !== -1)) ||
    decisionOpen ||
    Boolean(state.combatWindow) ||
    presenting ||
    phasePresentationPending ||
    (!manual && !isMyTurn);
  const breedingWindow = isBreedingWindow({
    phase: manual ? state.manual.turnPhase : state.phase,
    turnSeat: state.turnSeat,
    viewerSeat,
  });
  // An activated ＜Blitz＞ attacks inside the effect that processed it, which can resolve
  // outside Main (an [End of Your Turn] digivolution). The server projects an attack
  // outside Main only for that pending declaration.
  const blitzAttackPending = viewer.battleArea.some(canAttackWith);
  return {
    isMyTurn,
    turnActionBlocked,
    mainActionBlocked: turnActionBlocked || (state.phase !== Phase.Main && !blitzAttackPending),
    endPhaseBlocked:
      (manual &&
        (!isMyTurn ||
          (state.manual.turnPhase !== Phase.Main && state.manual.turnPhase !== Phase.Breeding) ||
          state.manual.combatStage !== ManualCombatStage.NONE.value)) ||
      turnActionBlocked ||
      (state.phase !== Phase.Main && state.phase !== Phase.Breeding),
    breedingWindow,
    // The breeding step is answered on the board rather than in a dialog: the egg
    // deck hatches, the raising slot moves out and the turn control ends the step.
    // These drive the highlights and the hint that stand in for the old modal.
    canHatchEgg: manual ? state.manual.canHatch : viewer.eggDeckCount > 0 && !viewer.breeding,
    canMoveOutOfBreeding: manual ? state.manual.canMoveFromBreeding : canMoveFromBreeding(viewer.breeding),
    /** Breeding actions open only after the phase presentation has finished. */
    breedingActionsOpen: breedingWindow && !turnActionBlocked,
  };
}
