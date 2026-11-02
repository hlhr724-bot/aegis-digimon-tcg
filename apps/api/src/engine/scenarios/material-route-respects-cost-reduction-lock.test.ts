import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/material-route-respects-cost-reduction-lock.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

const MATERIALS = ["chronicle-lv5", "chronicle-lv4", "chronicle-lv3"];

async function openMainPhase(withLock: boolean) {
  const opponent = { ...fixture.board[1], battleArea: withLock ? fixture.board[1]!.battleArea : [] };
  const s = setupScenario({ ...fixture, board: { ...fixture.board, 1: opponent } });
  s.state.phase = Phase.Main;
  await s.ready();
  return s;
}

describe("material cost route under a play-cost reduction lock", () => {
  it("does not offer an Assembly card whose only affordable route is a blocked reduction", async () => {
    const s = await openMainPhase(true);
    expect(s.inst("alphamon").playCostReductionBlocked).toBe(true);
    expect(s.inst("alphamon").playableFromHand).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("alphamon").instanceId,
        assembly: { materialInstanceIds: MATERIALS.map((alias) => s.inst(alias).instanceId) },
      }),
    ).toEqual({ ok: false, reason: "insufficient-memory" });
  });

  it("offers and plays the same Assembly at 0 memory once the lock is gone", async () => {
    const s = await openMainPhase(false);
    expect(s.inst("alphamon").playableFromHand).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("alphamon").instanceId,
        assembly: { materialInstanceIds: MATERIALS.map((alias) => s.inst(alias).instanceId) },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX13-060"),
    );
    expect(s.state.memory).toBe(-8);
  });
});
