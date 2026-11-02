import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import type { MainPhaseEnd } from "#api/engine/TurnStateMachine";

type Params = { engine: GameEngine; seat: Seat };

export async function resumeMainPhaseInput({ engine, seat }: Params): Promise<MainPhaseEnd> {
  if (engine.mainEntryPending || engine.deferredEndPhaseSeat !== undefined) {
    throw new Error("Main continuation requires a completed phase entry");
  }
  const ending = engine.mainPhase.run(seat);
  engine.projection.syncMainPhaseAffordances();
  try {
    return await ending;
  } finally {
    engine.projection.syncMainPhaseAffordances();
  }
}
