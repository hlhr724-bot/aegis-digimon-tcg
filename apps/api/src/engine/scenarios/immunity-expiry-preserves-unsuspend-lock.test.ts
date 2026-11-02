import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/immunity-expiry-preserves-unsuspend-lock.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it.each([true, false])(
  "keeps Lilamon's chosen unsuspend lock after immunity expires without suspending an immune target: %s",
  async (attacked) => {
    const s = setupScenario(fixture, { autoSelectCards: true, autoDeclineOptional: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: s.perm("magnamon").permanentId,
          instanceId: s.inst("magnamon-x").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT16-102") &&
          !s.state.pendingDecision,
      );
      expect(observe(s.engine).hasRestriction(s.perm("magnamon"), "beAffected")).toBe(true);
      const attackResult = attacked
        ? s.engine.applyIntent(1, {
            type: "attack",
            attackerPermanentId: s.perm("magnamon").permanentId,
            target: { kind: "player" },
          })
        : { ok: true };
      expect(attackResult).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
      advance(s.engine).endMainPhaseIfOpen(1);
      await advance(s.engine).waitForMainPhase(0);
      s.state.memory = 10;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("lilamon").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "ST24-10") && !s.state.pendingDecision,
      );
      expect(s.perm("magnamon").isSuspended).toBe(attacked);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      expect(observe(s.engine).hasRestriction(s.perm("magnamon"), "beAffected")).toBe(false);
      expect(s.perm("magnamon").isSuspended).toBe(attacked);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  },
);
