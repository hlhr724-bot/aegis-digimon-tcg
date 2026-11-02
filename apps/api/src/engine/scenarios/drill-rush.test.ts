import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-rush.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("rush drill", () => {
  it("plays BushiAgumon and wins with its attack on the same turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(player.battleArea).toHaveLength(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bushiAgumon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => player.battleArea.length === 1 && s.state.pendingDecision === undefined);
      const bushiAgumon = player.battleArea[0]!;
      expect(bushiAgumon.topCard.cardId).toBe("BT4-038");
      expect(bushiAgumon.enterFieldTurnCount).toBe(s.state.turnCount);
      expect(s.state.memory).toBe(0);
      await attackPlayer({ setup: s, seat: 0, attacker: bushiAgumon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
