import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/tutorial-tamers.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("tamers lesson", () => {
  it("plays Tai for extra DP and checks two security cards through Greymon's inherited effect", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const garudamon = s.perm("garudamon");
      expect(garudamon.currentDP).toBe(7000);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tai").instanceId })).toEqual({ ok: true });
      await settle(() => player.battleArea.some((permanent) => permanent.topCard.cardId === "ST1-12"));
      await advance(s.engine).recompute();
      expect(s.state.memory).toBe(1);
      expect(garudamon.currentDP).toBe(8000);
      await attackPlayer({ setup: s, seat: 0, attacker: garudamon });
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.players[1]!.trash.map((card) => card.cardId).sort()).toEqual(["ST2-02", "ST2-08"]);
      expect(player.battleArea).toContain(garudamon);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("dracomon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
