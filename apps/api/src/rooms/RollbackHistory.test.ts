import { describe, expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { RollbackKind } from "@aegis/shared/protocol/RollbackKind";
import { RollbackHistory } from "#api/rooms/RollbackHistory";

function history() {
  const result = new RollbackHistory({
    matchId: "rollback-ownership",
    seed: 0,
    rules: { deckFormat: "standard", unlimited: false, betaBattle: false },
  });
  result.beforeTurn(1, { state: new GameState(), refreshHandAffordances: () => {} });
  result.append({ kind: "intent", seat: 0, intent: { type: "endPhase" }, stateVersion: 0 });
  result.acceptAction(0);
  return result;
}

describe("rollback action ownership", () => {
  it("refuses a whole turn containing both players' actions but allows the latest actor to undo", () => {
    const result = history();
    result.append({
      kind: "intent",
      seat: 1,
      intent: { type: "respondDecision", decisionId: "block", response: { kind: "optional", accept: false } },
      stateVersion: 1,
    });
    result.acceptAction(1);
    expect(result.targetSeat(result.target(RollbackKind.TURN.value, 1)!)).toBe(-1);
    expect(result.targetSeat(result.target(RollbackKind.ACTION.value, 1)!)).toBe(1);
  });

  it("ignores rejected opponent actions when determining ownership", () => {
    const result = history();
    result.append({ kind: "intent", seat: 1, intent: { type: "endPhase" }, stateVersion: 1, ok: false });
    expect(result.targetSeat(result.target(RollbackKind.TURN.value, 1)!)).toBe(0);
    expect(result.targetSeat(result.target(RollbackKind.ACTION.value, 1)!)).toBe(0);
  });
});
