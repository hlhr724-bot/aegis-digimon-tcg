import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/tutorial-attack-security.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("attack security lesson", () => {
  it("lets the player break the last security card and win with a direct attack", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const birdramon = s.perm("birdramon");
      await attackPlayer({ setup: s, seat: 0, attacker: birdramon });
      expect(birdramon.isSuspended).toBe(true);
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["ST2-02"]);
      expect(s.state.gameOver).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("dracomon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
