import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-security-attack.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("security attack drill", () => {
  it("checks both security cards with one BlackWarGreymon attack and wins with Birdramon", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(opponent.security).toHaveLength(2);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("blackWarGreymon") });
      expect(opponent.security).toHaveLength(0);
      expect(opponent.trash.map((card) => card.cardId).sort()).toEqual(["ST2-02", "ST2-04"]);
      expect(s.state.gameOver).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
