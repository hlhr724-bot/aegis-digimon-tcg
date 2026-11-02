import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-delay.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("delay drill", () => {
  it("uses a previously placed Delay to fund BushiAgumon and win immediately", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const boost = s.perm("boost");
      const effect = observe(s.engine)
        .activatableEffects(boost)
        .find((entry) => entry.description?.includes("Delay"))!;
      expect(effect).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: boost.topCard.instanceId,
          effectKey: effect.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.memory === 5 && s.state.pendingDecision === undefined);
      expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT6-100");
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bushi").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT4-038") &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.memory).toBe(0);
      const bushi = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT4-038")!;
      await attackPlayer({ setup: s, seat: 0, attacker: bushi });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
