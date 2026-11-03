import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/attack-target-cannot-switch-to-current-target.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

async function attack(targetAlias: "nezhamon" | "otherTarget") {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);
  const redirectTargets = s.perm("attacker").attackRedirectTargets;
  expect(redirectTargets[s.perm("nezhamon").permanentId]?.targetIds).toEqual([]);
  expect(redirectTargets[s.perm("otherTarget").permanentId]?.targetIds).toEqual([s.perm("nezhamon").permanentId]);
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "permanent", permanentId: s.perm(targetAlias).permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "attackEnded"));
  return { s, loop };
}

describe("attack target cannot switch to the current target", () => {
  it("does not let Nezhamon switch an attack that already targets it to itself", async () => {
    const { s, loop } = await attack("nezhamon");
    try {
      expect(s.events.some((event) => event.kind === "attackDeclared" && event.redirected === true)).toBe(false);
      expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("EX12-019");
      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
        s.perm("attacker").permanentId,
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("still lets Nezhamon take an attack aimed at another Digimon and gain its bonus", async () => {
    const { s, loop } = await attack("otherTarget");
    try {
      expect(s.events.some((event) => event.kind === "attackDeclared" && event.redirected === true)).toBe(true);
      expect(s.perm("nezhamon").currentDP).toBe(16000);
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
        s.perm("otherTarget").permanentId,
      );
      expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT1-009");
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
