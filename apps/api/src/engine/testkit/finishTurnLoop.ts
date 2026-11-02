import type { EngineSetup } from "#api/engine/testkit/harness";

type Params = { setup: EngineSetup; loop: Promise<void> };

export async function finishTurnLoop({ setup, loop }: Params): Promise<void> {
  if (setup.state.gameOver) {
    setup.engine.mainPhase.abort();
    setup.engine.breeding.abort();
  } else {
    setup.engine.applyIntent(setup.state.turnSeat, { type: "surrender" });
  }
  await loop;
}
