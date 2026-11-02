import { describe, expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/salamon-own-security-removal.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("Salamon inherited security ownership", () => {
  it("does not reduce DP when its attack removes only opposing security", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true, autoAcceptOptional: true });
    await s.ready();
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("host").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 1);
      await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
      expect(s.state.players[0]!.security).toHaveLength(2);
      expect(s.state.players[1]!.security).toHaveLength(1);
      expect(s.perm("target").currentDP).toBe(7000);
    } finally {
      advance(s.engine).endMainPhaseIfOpen(0);
      await turn;
    }
  });

  it("reduces opposing DP after playing Blinding Ray removes its controller's security", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true });
    await s.ready();
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => s.state.players[0]!.trash.some((card) => card.cardId === "BT4-104") && !s.state.pendingDecision,
      );
      expect(s.state.players[0]!.security).toHaveLength(1);
      expect(s.perm("target").currentDP).toBe(5000);
    } finally {
      advance(s.engine).endMainPhaseIfOpen(0);
      await turn;
    }
  });
});
