import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { drainMicrotasks, settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/option-dp-deletion-attack-targets.fixture";
import "#api/cards/index";

it("drops a Digimon an Option deleted at 0 DP from the turn player's attack targets", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, { autoSelectCards: true, autoDeclineOptional: true, preferInstanceIds: preferred });
  const zeroDpTargetId = s.perm("zeroDpTarget").permanentId;
  const survivorId = s.perm("survivor").permanentId;
  preferred.push(zeroDpTargetId, s.perm("zeroDpTarget").topCard.instanceId);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect([...s.perm("attacker").attackablePermanentIds]).toEqual([zeroDpTargetId, survivorId]);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dpOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === zeroDpTargetId) &&
        s.state.pendingDecision === undefined,
    );
    await drainMicrotasks();
    expect([...s.perm("attacker").attackablePermanentIds]).toEqual([survivorId]);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
