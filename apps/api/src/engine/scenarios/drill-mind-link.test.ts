import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-mind-link.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("mind-link drill", () => {
  it("Mind Links Eiji to grant Alliance, clears two security, and wins with the remaining attacker", async () => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
    });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const eiji = s.perm("eiji");
      const host = s.perm("loogarmon");
      expect(observe(s.engine).hasKeyword(host, "Alliance")).toBe(false);
      expect(host.stack).toHaveLength(0);
      const effect = observe(s.engine)
        .activatableEffects(eiji)
        .find((entry) => entry.description?.includes("Mind Link"))!;
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: eiji.topCard.instanceId,
          effectKey: effect.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(
        () => host.stack.some((card) => card.cardId === "BT14-087") && s.state.pendingDecision === undefined,
      );
      expect(observe(s.engine).hasKeyword(host, "Alliance")).toBe(true);
      expect(observe(s.engine).hasKeyword(host, "Blocker")).toBe(true);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: host.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "alliance");
      expect(
        s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm("supporter").permanentId }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") &&
          s.state.combatWindow === undefined &&
          s.state.pendingDecision === undefined,
      );
      expect(s.perm("supporter").isSuspended).toBe(true);
      expect(s.state.players[1]!.security).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("finisher") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
