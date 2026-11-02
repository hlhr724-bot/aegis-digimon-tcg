import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-blitz.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("blitz drill", () => {
  it("pays across zero and uses BetelGammamon Blitz for the winning attack before passing the turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const biyomon = s.perm("biyomon");
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: biyomon.permanentId,
          instanceId: s.inst("betelGammamon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const optional = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: optional.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.engine.hasAcceptedBlitzAttack(biyomon.permanentId));
      expect(s.state.memory).toBe(-1);
      expect(biyomon.topCard.cardId).toBe("BT8-013");
      expect(s.state.turnSeat).toBe(0);
      await attackPlayer({ setup: s, seat: 0, attacker: biyomon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
