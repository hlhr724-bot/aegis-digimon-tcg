import { getManualBreedingOptions } from "#api/manual/getManualBreedingOptions";
import { extractCardAt, insertCard } from "#api/engine/state/access";
import type { GameState } from "@aegis/shared/schema/GameState";
import { Phase, Zone, type Seat } from "@aegis/shared/schema/enums";
import type { ServerEvent } from "@aegis/shared/protocol/events";

type Params = { state: GameState; emit: (event: ServerEvent) => void; declareDeckOutLoss?: (seat: Seat) => void };

export function prepareManualTurn({ state, emit, declareDeckOutLoss }: Params): void {
  const player = state.players[state.turnSeat]!;
  const table = state.manual;
  const changePhase = (phase: Phase) => {
    table.turnPhase = phase;
    emit({ kind: "phaseChanged", phase, turnSeat: state.turnSeat, turnCount: state.turnCount });
  };
  table.canHatch = false;
  table.canMoveFromBreeding = false;
  changePhase(Phase.Active);
  const unsuspended: string[] = [];
  for (const permanent of [...player.battleArea, ...(player.breeding ? [player.breeding] : [])]) {
    if (permanent.isSuspended) {
      permanent.isSuspended = false;
      unsuspended.push(permanent.permanentId);
    }
  }
  if (unsuspended.length) {
    emit({ kind: "cardsMoved", instanceIds: unsuspended, from: "suspended", to: "unsuspended" });
  }
  changePhase(Phase.Draw);
  if (!state.isFirstPlayersFirstTurn) {
    const card = extractCardAt(player, Zone.Deck, 0);
    if (!card) {
      if (declareDeckOutLoss) {
        declareDeckOutLoss(player.seat);
      } else {
        player.lost = true;
        state.gameOver = true;
        const winnerSeat = (1 - player.seat) as Seat;
        state.winnerSeat = winnerSeat;
        emit({ kind: "gameOver", reason: "deckOut", result: { outcome: "win", winnerSeat } });
      }
      return;
    }
    card.faceUp = false;
    insertCard(player, Zone.Hand, card);
  }
  const options = getManualBreedingOptions({ player });
  table.canHatch = options.canHatch;
  table.canMoveFromBreeding = options.canMoveFromBreeding;
  changePhase(Phase.Breeding);
  if (!table.canHatch && !table.canMoveFromBreeding) {
    changePhase(Phase.Main);
  }
}
