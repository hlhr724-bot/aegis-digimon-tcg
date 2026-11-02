import type { TrainingAction } from "#api/bot/training/actions";
import type { TrainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";

export interface PlannedTurnState {
  observation: TrainingObservation;
  actions: readonly TrainingAction[];
  ended: boolean;
  memoryGiven?: number;
  won: boolean;
  plannedPermanents: number;
}

export function createPlannedTurnState(window: TrainingWindow): PlannedTurnState {
  return {
    observation: { ...window.observation, history: { seenCardIds: [], knownCards: [], recent: [] } },
    actions: window.actions,
    ended: false,
    won: false,
    plannedPermanents: 0,
  };
}
