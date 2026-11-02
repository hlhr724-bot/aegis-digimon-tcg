import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/original-dp-after-immunity-expiry.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it("retains Mistymon's chosen original-DP effect while Ceresmon is immune and applies it after immunity ends", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
  await s.ready();
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("ceresmon").instanceId })).toEqual({
      ok: true,
    });
    await advance(s.engine).waitForMainPhase(0);
    const ceresmon = s.perm("ceresmon");
    preferred.push(ceresmon.permanentId);
    expect(observe(s.engine).hasRestriction(ceresmon, "beAffected", "Digimon")).toBe(true);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT18-039") && !s.state.pendingDecision,
    );
    expect(ceresmon.currentDP).toBe(12000);
    expect(s.state.players[0]!.security).toHaveLength(1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasRestriction(ceresmon, "beAffected", "Digimon")).toBe(false);
    expect(ceresmon.currentDP).toBe(6000);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(ceresmon.currentDP).toBe(12000);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
