import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/attack-target-change-bonus-before-battle.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

it("applies Nezhamon's DP bonus before comparing battle DP after Collision", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackEnded"));
    expect(s.perm("attacker").currentDP).toBe(16000);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("ST1-11");
    const bonus = s.events.findIndex((event) => event.kind === "effectResolved" && event.sourceCardId === "EX12-019");
    const battle = s.events.findIndex((event) => event.kind === "battleCompared");
    expect(bonus).toBeGreaterThan(-1);
    expect(battle).toBeGreaterThan(bonus);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
