import type { GameState, Permanent, PlayerState, Seat } from "@aegis/shared";
import { TutorialGoalKind } from "@aegis/shared/tutorial/TutorialGoalKind";
import type { TutorialGoal } from "@aegis/shared/tutorial/TutorialStep";

type Params = { goal: TutorialGoal; state: GameState; viewerSeat: Seat };

function findFieldPermanent(player: PlayerState | undefined, cardId: string): Permanent | undefined {
  return player?.battleArea.find((permanent) => permanent.topCard?.cardId === cardId);
}

export function evaluateTutorialGoal({ goal, state, viewerSeat }: Params): boolean {
  const viewer = state.players[viewerSeat];
  const opponent = state.players[viewerSeat === 0 ? 1 : 0];
  switch (goal.kind) {
    case TutorialGoalKind.ACKNOWLEDGE.value:
      return false;
    case TutorialGoalKind.VIEWER_PHASE.value:
      return state.turnSeat === viewerSeat && state.phase === goal.phase;
    case TutorialGoalKind.OPPONENT_TURN.value:
      return state.turnSeat !== viewerSeat;
    case TutorialGoalKind.BREEDING_HAS_CARD.value:
      return goal.cardId === undefined
        ? viewer?.breeding !== undefined
        : viewer?.breeding?.topCard?.cardId === goal.cardId;
    case TutorialGoalKind.FIELD_HAS_CARD.value:
      return findFieldPermanent(viewer, goal.cardId) !== undefined;
    case TutorialGoalKind.HAND_HAS_CARD.value:
      return viewer?.hand.some((card) => card.cardId === goal.cardId) === true;
    case TutorialGoalKind.CARD_UNSUSPENDED.value:
      return findFieldPermanent(viewer, goal.cardId)?.isSuspended === false;
    case TutorialGoalKind.STACK_HEIGHT_AT_LEAST.value:
      return (findFieldPermanent(viewer, goal.cardId)?.stack.length ?? -1) + 1 >= goal.height;
    case TutorialGoalKind.CARD_SUSPENDED.value:
      return (
        viewer?.battleArea.some((permanent) => permanent.topCard?.cardId === goal.cardId && permanent.isSuspended) ===
        true
      );
    case TutorialGoalKind.TRASH_HAS_CARD.value:
      return viewer?.trash.some((card) => card.cardId === goal.cardId) === true;
    case TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value:
      return opponent !== undefined && opponent.securityCount <= goal.count;
    case TutorialGoalKind.BLOCK_WINDOW_OPEN.value:
      return state.combatWindow?.kind === "block" && state.combatWindow.seat === viewerSeat;
    case TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value:
      return opponent?.trash.some((card) => card.cardId === goal.cardId) === true;
    case TutorialGoalKind.VIEWER_SECURITY_AT_MOST.value:
      return viewer !== undefined && viewer.securityCount <= goal.count;
    case TutorialGoalKind.VIEWER_SECURITY_AT_LEAST.value:
      return viewer !== undefined && viewer.securityCount >= goal.count;
    case TutorialGoalKind.PERMANENT_LINK_COUNT_AT_LEAST.value:
      return (findFieldPermanent(viewer, goal.cardId)?.linked.length ?? 0) >= goal.count;
    case TutorialGoalKind.PERMANENT_LINK_COUNT_AT_MOST.value: {
      const permanent = findFieldPermanent(viewer, goal.cardId);
      return permanent !== undefined && permanent.linked.length <= goal.count;
    }
    case TutorialGoalKind.STACK_HEIGHT_AT_MOST.value: {
      const permanent = findFieldPermanent(viewer, goal.cardId);
      return permanent !== undefined && permanent.stack.length + 1 <= goal.height;
    }
    case TutorialGoalKind.STACK_HAS_CARD.value:
      return findFieldPermanent(viewer, goal.cardId)?.stack.some((card) => card.cardId === goal.sourceCardId) === true;
    case TutorialGoalKind.MEMORY_AT_LEAST.value:
      return (state.turnSeat === viewerSeat ? state.memory : -state.memory) >= goal.amount;
  }
}
