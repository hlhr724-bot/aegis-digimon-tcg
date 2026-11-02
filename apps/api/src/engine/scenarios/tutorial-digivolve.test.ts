import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/tutorial-digivolve.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("digivolve lesson", () => {
  it("digivolves Agumon into Greymon with a bonus draw and wins this turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const agumon = s.perm("agumon");
      const handBefore = player.hand.length;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: agumon.permanentId,
          instanceId: s.inst("greymon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => agumon.topCard.cardId === "ST1-07" && s.state.pendingDecision === undefined);
      expect(s.state.memory).toBe(1);
      expect(player.hand).toHaveLength(handBefore);
      expect(player.hand.at(-1)!.cardId).toBe("ST1-13");
      expect(agumon.stack.map((card) => card.cardId)).toEqual(["ST1-03"]);
      expect(agumon.currentDP).toBe(5000);
      await attackPlayer({ setup: s, seat: 0, attacker: agumon });
      expect(agumon.isSuspended).toBe(true);
      expect(s.state.players[1]!.security).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("biyomon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
