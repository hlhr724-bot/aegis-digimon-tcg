import type { GameEngine } from "#api/engine/GameEngine";
import { collectStagedDecks, runMulliganWindow } from "#api/engine/gameEngine/matchLifecycle";
import { finalizeSecurity, runSetup } from "#api/engine/setup";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { clearZone } from "#api/engine/state/access";
import { Zone } from "@aegis/shared/schema/enums";

type Params = { engine: GameEngine; firstSeat: Seat };

export async function restartManualMatch({ engine, firstSeat }: Params): Promise<void> {
  const decks = collectStagedDecks(engine);
  if (!decks || !engine.manual) {
    return;
  }
  const state = engine.state;
  state.phase = Phase.None;
  state.pendingDecision = undefined;
  state.combatWindow = undefined;
  for (const player of state.players) {
    clearZone(player, Zone.Delay);
    player.manualInspectionJson = "[]";
  }
  const setup = runSetup(state, {
    seats: [
      { sessionId: state.players[0]!.sessionId, displayName: state.players[0]!.displayName, deck: decks[0] },
      { sessionId: state.players[1]!.sessionId, displayName: state.players[1]!.displayName, deck: decks[1] },
    ],
    firstSeat,
    seed: engine.hooks.seed ^ state.manual.restartCount,
    randomKey: `${engine.hooks.randomKey ?? "manual"}:restart:${state.manual.restartCount}`,
    onShuffled: (seat, deck) => engine.hooks.emit({ kind: "deckShuffled", seat, deck }),
  });
  engine.rngForSeat = setup.rngForSeat;
  engine.hooks.emit({ kind: "matchStarted", firstSeat });
  await runMulliganWindow(engine, firstSeat);
  if (state.gameOver) {
    return;
  }
  finalizeSecurity(state);
  engine.manual.begin();
  engine.hooks.emit({ kind: "manualAction", seat: firstSeat, action: "restart prepared" });
}
