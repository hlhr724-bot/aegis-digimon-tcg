import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/raid-battle-enables-piercing.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each([false, true])("checks security after WarGreymon accepts Raid: %s", async (acceptRaid) => {
  const s = setupScenario(fixture, { autoSelectCards: false });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("wargreymon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: {
        kind: "selectCards",
        instanceIds: acceptRaid ? [s.perm("raid-target").topCard.instanceId] : [],
      },
    }),
  ).toEqual({ ok: true });
  await advance(s.engine).finishAttack();
  expect(s.state.players[1]!.security).toHaveLength(2);
  expect(s.state.players[1]!.battleArea).toHaveLength(acceptRaid ? 0 : 1);
  expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
  expect(s.state.memory).toBe(3);
  expect(s.state.pendingDecision).toBeUndefined();
});
