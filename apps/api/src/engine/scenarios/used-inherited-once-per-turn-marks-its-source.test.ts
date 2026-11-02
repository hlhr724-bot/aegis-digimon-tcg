import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/used-inherited-once-per-turn-marks-its-source.fixture";

describe("Used inherited [Once Per Turn] effect marks its own source", () => {
  it("marks only the Megadramon copy whose End of Attack effect resolved, then clears it next turn", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const attacker = s.perm("attacker");
      const megadramons = [s.inst("lowerMegadramon"), s.inst("upperMegadramon")];
      expect(megadramons.map((card) => card.oncePerTurnUsed)).toEqual([false, false]);

      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: attacker.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.length === 1 &&
          s.engine.mainVerbContinuationsInFlight === 0 &&
          s.state.pendingDecision === undefined &&
          s.state.phase === Phase.Main,
      );

      expect(attacker.isSuspended).toBe(false);
      expect(megadramons.filter((card) => card.oncePerTurnUsed)).toHaveLength(1);
      expect(attacker.topCard.oncePerTurnUsed).toBe(false);

      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(megadramons.map((card) => card.oncePerTurnUsed)).toEqual([false, false]);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
