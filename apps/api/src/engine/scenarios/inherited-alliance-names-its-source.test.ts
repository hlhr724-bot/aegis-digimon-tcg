import "#api/cards/EX13/EX13-012";
import "#api/cards/ST20/ST20-04";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/inherited-alliance-names-its-source.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

it("attributes an inherited Alliance to its digivolution card in the effect order prompt", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false });
  await s.ready();
  s.state.phase = Phase.Main;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "orderTriggers");

  const options = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req.options!;
  const alliances = (options.triggerKeys ?? [])
    .map((key, index) => ({ key, cardId: options.triggerCardIds?.[index] }))
    .filter(({ key }) => key.includes("/alliance/"));

  expect(alliances.map(({ cardId }) => cardId).sort()).toEqual(["EX13-012", "ST20-04"]);
  expect(alliances.every(({ key }) => key.startsWith(s.perm("attacker").topCard.instanceId))).toBe(true);
});

it("still resolves both the printed and the inherited Alliance", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  await s.ready();
  s.state.phase = Phase.Main;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  for (const [index, ally] of ["firstAlly", "secondAlly"].entries()) {
    await settle(() => s.events.filter((event) => event.kind === "alliancePrompt").length > index);
    expect(s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm(ally).permanentId })).toEqual({
      ok: true,
    });
  }
  await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);

  expect(s.perm("firstAlly").isSuspended).toBe(true);
  expect(s.perm("secondAlly").isSuspended).toBe(true);
});
