import { advance } from "#api/engine/testkit/advance";
import { expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { internalsOf } from "#api/engine/testkit/internals";
import { getEffectModule } from "#api/engine/effects/registry";
import fixture from "#api/engine/scenarios/optional-activation-target-cancellation.fixture";
import "#api/cards/BT25/BT25-029";

it("cancels a tentative return after evolution while preserving the evolution and its shared once-per-turn opportunity", async () => {
  const scenario = setupScenario(fixture);
  await scenario.ready();
  const loop = scenario.engine.startTurnLoop();
  await advance(scenario.engine).waitForMainPhase(0);
  try {
    expect(
      scenario.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: scenario.perm("base").permanentId,
        instanceId: scenario.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => scenario.state.pendingDecision?.kind === "optional");
    expect(
      scenario.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: scenario.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => scenario.state.pendingDecision?.kind === "chooseTargets");
    expect(scenario.decisions.at(-1)!.req.options?.canCancelActivation).toBe(true);
    const memoryAfterEvolution = scenario.state.memory;
    expect(
      scenario.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: scenario.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(scenario.perm("base").topCard.cardId).toBe("BT25-029");
    expect(scenario.state.memory).toBe(memoryAfterEvolution);
    expect(scenario.perm("opponent").topCard.cardId).toBe("ST1-03");
    const engine = internalsOf(scenario.engine);
    const source = engine.cardSourceOf(scenario.perm("base").topCard);
    const effect = getEffectModule("BT25-029")!
      .effectsForTiming(EffectTiming.OnUseAttack, source)
      .find((entry) => entry.optional)!;
    expect(engine.tracker.count(source.instanceId, effect.effectKey)).toBe(0);
    expect(scenario.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT25-029")).toBe(
      false,
    );
    expect(
      scenario.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: scenario.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => scenario.state.pendingDecision?.kind === "optional");
    expect(scenario.decisions.at(-1)!.req.sourceCardId).toBe("BT25-029");
    scenario.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: scenario.state.pendingDecision!.decisionId,
      response: { kind: "optional", accept: false },
    });
    await settle();
  } finally {
    scenario.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
