import { expect, it } from "vitest";
import { EffectTiming, Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import { effectsOf } from "#api/engine/effects/collect";
import fixture from "#api/engine/scenarios/takato-biomerge-requires-exact-guilmon.fixture";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

it("rejects Takato's biomerge on Guilmon X even with Guilmon in its sources and both required trash materials", async () => {
  const s = setupScenario(fixture);
  s.state.phase = Phase.Main;
  await s.ready();
  const takato = s.inst("takato");
  const effect = effectsOf(EffectTiming.OnDeclaration, observe(s.engine).cardSource(takato))[0]!;

  expect(s.perm("takato").activatableEffectsJson).toBe("");
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: takato.instanceId,
      effectKey: effect.effectKey,
    }).ok,
  ).toBe(false);
  expect(s.state.memory).toBe(8);
  expect(s.perm("takato").topCard.instanceId).toBe(takato.instanceId);
  expect(s.perm("guilmonX").topCard.cardId).toBe("EX8-009");
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([
    s.inst("growlmon").instanceId,
    s.inst("warGrowlmon").instanceId,
  ]);
  expect(s.state.pendingDecision).toBeUndefined();
});

it("offers only exact Guilmon for Takato's biomerge when Guilmon X is also in play", async () => {
  const preferInstanceIds: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoOrderCards: true,
    preferInstanceIds,
  });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
  const guilmon = s.state.players[0]!.battleArea.find(
    (permanent) => permanent.topCard.instanceId === s.inst("guilmon").instanceId,
  )!;
  preferInstanceIds.push(s.perm("guilmonX").topCard.instanceId, s.inst("gallantmon").instanceId);
  const takato = s.inst("takato");
  const effect = observe(s.engine).activatableEffects(s.perm("takato"))[0]!;
  const memoryBefore = s.state.memory;

  expect(effect).toBeDefined();
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: takato.instanceId,
      effectKey: effect.effectKey,
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      guilmon.topCard.instanceId === s.inst("gallantmon").instanceId &&
      s.engine.mainVerbContinuationsInFlight === 0 &&
      !s.state.pendingDecision,
  );

  expect(s.perm("guilmonX").topCard.cardId).toBe("EX8-009");
  expect(guilmon.stack.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([
      takato.instanceId,
      s.inst("growlmon").instanceId,
      s.inst("warGrowlmon").instanceId,
      s.inst("guilmon").instanceId,
    ]),
  );
  expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === takato.instanceId)).toBe(
    false,
  );
  expect(s.state.memory).toBe(memoryBefore - 4);
  expect(guilmon.currentDP).toBe(guilmon.baseDP + 6000);
  expect(s.state.pendingDecision).toBeUndefined();
});
