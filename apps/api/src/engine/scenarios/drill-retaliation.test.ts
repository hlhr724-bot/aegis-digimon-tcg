import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-retaliation.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("retaliation drill", () => {
  it("trades Candlemon for a stronger blocker through Retaliation and wins with Birdramon", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const candlemon = s.perm("candlemon");
      expect(candlemon.currentDP).toBeLessThan(s.perm("monochromon").currentDP);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: candlemon.permanentId,
          target: { kind: "permanent", permanentId: s.perm("monochromon").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") && !s.state.combatWindow && !s.state.pendingDecision,
      );
      expect(player.trash.some((card) => card.cardId === "BT20-062")).toBe(true);
      expect(opponent.trash.some((card) => card.cardId === "BT14-011")).toBe(true);
      expect(opponent.battleArea).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
