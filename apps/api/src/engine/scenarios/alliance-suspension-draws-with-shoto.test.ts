import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/alliance-suspension-draws-with-shoto.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it("draws when Shoto reacts to an opponent's Alliance suspension", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "alliancePrompt"));
  expect(s.perm("shoto").isSuspended).toBe(false);
  expect(s.state.players[0]!.hand).toHaveLength(0);
  expect(s.engine.applyIntent(1, { type: "respondAlliance", allyPermanentId: s.perm("ally").permanentId })).toEqual({
    ok: true,
  });
  await settle();
  expect(s.state.players[0]!.hand).toHaveLength(1);
  expect(s.perm("shoto").isSuspended).toBe(true);
  expect(s.perm("bird").currentDP).toBe(4000);
  expect(s.perm("ally").isSuspended).toBe(true);
  await advance(s.engine).finishAttack();
  expect(s.state.pendingDecision).toBeUndefined();
});
