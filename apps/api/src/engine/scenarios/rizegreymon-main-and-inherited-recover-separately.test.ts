import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/rizegreymon-main-and-inherited-recover-separately.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it("recovers Marcus through both RizeGreymon's normal effect and its inherited effect in one turn", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferInstanceIds: preferred,
  });
  preferred.push(s.perm("first-marcus").permanentId);
  const firstMarcusId = s.perm("first-marcus").topCard.instanceId;
  const secondMarcusId = s.perm("second-marcus").topCard.instanceId;
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("geogreymon").permanentId,
      instanceId: s.inst("rizegreymon").instanceId,
      useAlternateCost: true,
    }),
  ).toEqual({ ok: true });
  await settle(() => observe(s.engine).isAttacking());
  await advance(s.engine).finishAttack();
  await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === firstMarcusId));
  expect(s.state.players[0]!.security).toHaveLength(4);
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("geogreymon").permanentId,
      instanceId: s.inst("shinegreymon").instanceId,
      useAlternateCost: true,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("second-marcus").currentDP === 3000 && s.state.pendingDecision === undefined);
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("second-marcus").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await advance(s.engine).finishAttack();
  await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
  expect(s.state.players[0]!.security).toHaveLength(5);
  expect(s.state.players[0]!.security[0]?.instanceId).toBe(secondMarcusId);
  expect(s.state.players[0]!.security.map((card) => card.instanceId)).toContain(firstMarcusId);
});
