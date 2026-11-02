import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-de-digivolve.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("de-digivolve drill", () => {
  it("strips the opposing Blocker with Andromon and wins with an unblocked attack", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const tankmon = s.perm("tankmon");
      const target = s.perm("monochromon");
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: tankmon.permanentId,
          instanceId: s.inst("andromon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => target.topCard.cardId === "ST2-02" && s.state.pendingDecision === undefined);
      expect(tankmon.topCard.cardId).toBe("ST15-10");
      expect(target.stack).toHaveLength(0);
      expect(opponent.trash.map((card) => card.cardId)).toEqual(["BT14-011"]);
      await attackPlayer({ setup: s, seat: 0, attacker: tankmon });
      expect(s.events.some((event) => event.kind === "blockWindowOpened")).toBe(false);
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
