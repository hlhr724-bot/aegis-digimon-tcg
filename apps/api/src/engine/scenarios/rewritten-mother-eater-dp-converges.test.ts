import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/rewritten-mother-eater-dp-converges.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { advance } from "#api/engine/testkit/advance";

it("settles a Mother Eater rewritten as Sukamon under a continuous DP reduction", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  try {
    expect(s.perm("motherTarget").currentDP).toBe(13000);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("sukamon").permanentId,
        instanceId: s.inst("kingSukamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[1]!.trash.some(({ cardId }) => cardId === "BT22-007") && !s.state.pendingDecision,
    );
    await expect(s.engine.recomputeContinuousEffects()).resolves.toBeUndefined();
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.breeding?.topCard.cardId).toBe("BT22-007");
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT3-061")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("kingEtemon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 4 && !observe(s.engine).isAttacking());
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("followUp").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("followUp").instanceId) &&
        !s.state.pendingDecision,
    );
    await expect(s.engine.recomputeContinuousEffects()).resolves.toBeUndefined();
  } finally {
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  }
});
