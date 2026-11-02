import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-digisorption.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

describe("digisorption drill", () => {
  it("suspends Kunemon to pay one memory for Pistmon and wins with the evolved Digimon", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      preferInstanceIds: preferred,
    });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const base = s.perm("lighdramon");
      preferred.push(s.perm("kunemon").permanentId, s.perm("kunemon").topCard.instanceId);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: base.permanentId,
          instanceId: s.inst("pistmon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => base.topCard.cardId === "BT8-054" && s.state.pendingDecision === undefined);
      expect(s.perm("kunemon").isSuspended).toBe(true);
      expect(s.state.memory).toBe(0);
      expect(base.isSuspended).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: base });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
