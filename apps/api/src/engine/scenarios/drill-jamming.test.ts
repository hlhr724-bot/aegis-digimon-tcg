import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-jamming.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("jamming drill", () => {
  it("keeps Tyrannomon alive against a larger Security Digimon and wins next turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const tyrannomon = s.perm("tyrannomon");
      expect(tyrannomon.currentDP).toBeLessThan(12000);
      await attackPlayer({ setup: s, seat: 0, attacker: tyrannomon });
      expect(opponent.security).toHaveLength(0);
      expect(opponent.trash.map((card) => card.cardId)).toEqual(["ST2-10"]);
      expect(player.battleArea).toContain(tyrannomon);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await runFixtureBotTurn({ setup: s, fixture });
      await advance(s.engine).waitForMainPhase(0);
      expect(tyrannomon.isSuspended).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: tyrannomon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
