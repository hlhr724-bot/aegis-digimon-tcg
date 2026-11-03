import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { RollbackControls } from "@/game/RollbackControls";
import type { AegisRoom } from "@/net/client";

vi.mock("@/i18n/useTranslation", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("rollback controls ownership", () => {
  it.each([0, 1])("shows rollback only to the action owner in seat %s", (owner) => {
    const state = new GameState();
    state.allowRollback = true;
    state.turnCount = 1;
    state.canUndoAction = true;
    state.canRollbackTurn = true;
    state.undoActionSeat = owner;
    state.rollbackTurnSeat = owner;
    const room = {} as AegisRoom;
    const own = renderToStaticMarkup(<RollbackControls state={state} room={room} seat={owner} />);
    const opponent = renderToStaticMarkup(<RollbackControls state={state} room={room} seat={1 - owner} />);
    expect(own).toContain('aria-label="rollback.controls"');
    expect(own).not.toContain('disabled=""');
    expect(opponent).not.toContain('aria-label="rollback.controls"');
  });

  it("hides rollback on your turn when only the opponent's prompt answer can be undone", () => {
    const state = new GameState();
    state.allowRollback = true;
    state.turnCount = 3;
    state.canUndoAction = true;
    state.undoActionSeat = 1;
    state.canRollbackTurn = false;
    state.rollbackTurnSeat = -1;
    const markup = renderToStaticMarkup(<RollbackControls state={state} room={{} as AegisRoom} seat={0} />);
    expect(markup).not.toContain('aria-label="rollback.controls"');
  });
});
