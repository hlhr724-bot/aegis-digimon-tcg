import "#api/cards/AD1/AD1-004";
import "#api/cards/ST21/ST21-04";
import "#api/cards/ST21/ST21-06";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/alliance-exceeds-remaining-security.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

it.each([0, 1, 4])("resolves both Alliance instances against %s remaining security cards", async (security) => {
  const s = setupScenario({ ...fixture, board: { ...fixture.board, 1: { ...fixture.board[1], security } } });
  await s.ready();
  s.state.phase = Phase.Main;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.combatWindow?.kind === "alliance");
  expect(s.state.combatWindow?.eligiblePermanentIds).toContain(s.perm("firstAlly").permanentId);
  expect(
    s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm("firstAlly").permanentId }),
  ).toEqual({ ok: true });
  await settle(() => s.events.filter((event) => event.kind === "alliancePrompt").length === 2);
  expect(s.state.combatWindow?.eligiblePermanentIds).toContain(s.perm("secondAlly").permanentId);
  expect(
    s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm("secondAlly").permanentId }),
  ).toEqual({ ok: true });
  await settle(() => !observe(s.engine).isAttacking());
  expect(s.perm("firstAlly").isSuspended).toBe(true);
  expect(s.perm("secondAlly").isSuspended).toBe(true);
  expect(s.events.filter((event) => event.kind === "allianceResolved")).toHaveLength(2);
  expect(s.state.players[1]!.security).toHaveLength(Math.max(0, security - 3));
});
