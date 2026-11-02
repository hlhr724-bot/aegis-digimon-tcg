import "#api/cards/BT1/BT1-062";
import "#api/cards/EX6/EX6-031";
import "#api/cards/EX12/EX12-048";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/security-attack-flip-keeps-positive.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

async function setupBoard() {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, declineDigiXros: true });
  await s.ready();
  s.state.phase = Phase.Main;
  return s;
}

async function digivolveIntoFlipper(s: Awaited<ReturnType<typeof setupBoard>>) {
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("flipper").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(
    () => s.perm("base").topCard?.instanceId === s.inst("flipper").instanceId && s.state.pendingDecision === undefined,
  );
}

async function attackPlayer(s: Awaited<ReturnType<typeof setupBoard>>) {
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
}

describe("Security Attack flip keeps positive grants", () => {
  it("checks two security cards with a printed Security Attack +1 and no flip", async () => {
    const s = await setupBoard();
    expect(s.perm("attacker").securityAttack).toBe(2);
    await attackPlayer(s);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });

  it("keeps the printed +1 and flips the granted -1 into +1 during your turn", async () => {
    const s = await setupBoard();
    await digivolveIntoFlipper(s);
    expect(observe(s.engine).keywordAmount(s.perm("attacker"), "SecurityAttack")).toBe(0);
    expect(s.perm("attacker").securityAttack).toBe(3);
    expect(s.perm("attacker").securityAttackModifier).toBe(2);
    await attackPlayer(s);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });
});
