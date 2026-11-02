import { GameMode } from "@aegis/shared/manual/GameMode";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Phase } from "@aegis/shared/schema/enums";

type Params = { state: Pick<GameState, "gameMode" | "phase" | "turnCount" | "manual"> };

export function getGamePhase({ state }: Params): Phase {
  if (state.gameMode === GameMode.MANUAL.value && state.turnCount > 0) {
    return state.manual.turnPhase;
  }
  return state.phase;
}
