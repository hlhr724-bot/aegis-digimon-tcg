import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-digi-burst.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("digi-burst drill", () => {
  it("trashes two sources to suspend the blocker, checks security, and wins with Birdramon", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const hercules = s.perm("hercules");
      const effect = observe(s.engine)
        .activatableEffects(hercules)
        .find((entry) => entry.description?.includes("Digi-Burst"))!;
      expect(effect).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: hercules.topCard.instanceId,
          effectKey: effect.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("monochromon").isSuspended && s.state.pendingDecision === undefined);
      expect(hercules.stack).toHaveLength(1);
      expect(s.state.players[0]!.trash).toHaveLength(2);
      await attackPlayer({ setup: s, seat: 0, attacker: hercules });
      expect(s.state.players[1]!.security).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
