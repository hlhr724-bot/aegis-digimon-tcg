import { expect, it } from "vitest";
import { EffectTiming, Phase } from "@aegis/shared/schema/enums";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import type { CardEffect } from "@aegis/shared/effects/ir/card";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/bot-selects-by-effect-purpose.fixture";
import "#api/cards/BT1/BT1-009";

it("answers real removal, payment and recovery requests according to their effect metadata", async () => {
  const original = runtimeCompiledCard("BT1-009");
  if (original === undefined) {
    throw new Error("Expected registered neutral source");
  }
  const effects: CardEffect[] = [
    {
      trigger: "OnPlay",
      actions: [
        { kind: "Delete", target: { filter: { controller: "opponent", zone: "battleArea" }, count: 1 } },
        {
          kind: "Draw",
          controller: "mine",
          amount: 1,
          cost: { kind: "trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } },
        },
        {
          kind: "Return",
          to: "hand",
          from: ["trash"],
          target: { filter: { controller: "mine", zone: "trash" }, count: 1 },
        },
      ],
    },
  ];
  registerIrCard("BT1-009", { effects, coverage: "full", residual: [] });
  try {
    const setup = setupScenario(fixture, { autoOrderTriggers: true });
    setup.state.phase = Phase.Main;
    await setup.ready();
    const policy = createEvaluationPolicy();
    let finished = false;
    const resolution = advance(setup.engine)
      .fire(EffectTiming.OnPlay, setup.perm("source"))
      .then(() => {
        finished = true;
      });
    while (!finished) {
      await settle(() => finished || setup.state.pendingDecision !== undefined);
      if (finished) {
        break;
      }
      const request = setup.decisions.at(-1)!.req;
      const intent = policy.answerDecision(buildBotView(setup.state, 0), request);
      expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
    }
    await resolution;
    expect(setup.state.players[1]!.battleArea.map((unit) => unit.permanentId)).toEqual([
      setup.perm("smallTarget").permanentId,
    ]);
    expect(setup.state.players[0]!.trash.some((card) => card.instanceId === setup.inst("cheapCost").instanceId)).toBe(
      true,
    );
    expect(setup.state.players[0]!.hand.some((card) => card.instanceId === setup.inst("valuableHand").instanceId)).toBe(
      true,
    );
    expect(
      setup.state.players[0]!.hand.some((card) => card.instanceId === setup.inst("largeRecovery").instanceId),
    ).toBe(true);
    expect(setup.decisions.map(({ req }) => req.options?.targetFate)).toContain("delete");
    expect(setup.decisions.map(({ req }) => req.options?.purpose)).toContain("cost");
    expect(setup.decisions.map(({ req }) => req.options?.selectionGoal)).toContain(DecisionSelectionGoal.GAIN.value);
  } finally {
    registerIrCard("BT1-009", original);
  }
});
