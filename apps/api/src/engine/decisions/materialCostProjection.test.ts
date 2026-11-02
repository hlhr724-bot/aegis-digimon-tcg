import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { expect, it } from "vitest";
import "../../cards/index.js";
import { buildEffectContext } from "../gameEngine/effectContext.js";
import { setupEngine } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

it.each(["assemblyCardId", "digiXrosCardId"] as const)(
  "#5413: %s material requests publish the live cost-reduction prohibition to the choosing player",
  async (materialKey) => {
    const s = setupEngine({
      0: { hand: [{ card: "EX13-031", as: "king" }], trash: ["EX5-046"] },
      1: { battleArea: ["BT8-071"] },
    });
    await s.ready();
    expect(s.inst("king").playCostReductionBlocked).toBe(true);
    const ctx = buildEffectContext(s.engine, observe(s.engine).cardSource(s.inst("king")), {});
    ctx.activeDecisionSelectionGoal = DecisionSelectionGoal.PLAY.value;
    const choice = s.engine.decisionApi.selectCards(ctx, {
      candidates: s.state.players[0]!.trash.map((c) => c.instanceId),
      min: 0,
      max: 1,
      [materialKey]: "EX13-031",
    });
    const request = s.decisions.at(-1)!.req;
    expect(request.options?.selectionGoal).toBe(DecisionSelectionGoal.MATERIAL.value);
    expect(request.options?.playCostReductionBlocked).toBe(true);
    expect(JSON.parse(s.state.pendingDecision!.payloadJson).playCostReductionBlocked).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    expect(await choice).toEqual([]);
  },
);
