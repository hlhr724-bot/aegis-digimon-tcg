import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-succession.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("succession drill", () => {
  it("uses a copied Ceresmon effect to delete the blocker, checks security with Palmon, and wins with Dracomon", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const host = s.perm("ceresmon");
      expect(host.stack.map((card) => card.cardId)).toEqual(["BT25-059"]);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("palmon") });
      expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT1-031");
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.players[0]!.battleArea).toContain(s.perm("palmon"));
      expect(s.state.gameOver).toBe(false);
      expect(host.isSuspended).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("finisher") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
