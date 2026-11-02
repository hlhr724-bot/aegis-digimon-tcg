import { Phase } from "@aegis/shared/schema/enums";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import { mainActionReady, mainActions } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";

type Params = { engine: GameEngine; seat: Seat };

export function getReplaySearchWindow({ engine, seat }: Params): TrainingWindow {
  const state = engine.state;
  if (
    state.gameOver ||
    state.phase !== Phase.Main ||
    state.turnSeat !== seat ||
    !mainActionReady(engine) ||
    state.pendingDecision ||
    state.combatWindow
  ) {
    throw new Error("Replay root requires a settled main window for the acting seat");
  }
  return {
    observation: trainingObservation(state, seat),
    kind: "main",
    selected: [],
    actions: mainActions(engine, seat).filter((action) => action.intent.type !== "activateEffect"),
  };
}
