import { expect, it } from "vitest";
import "#api/cards/BT2/BT2-110";
import "#api/cards/BT10/BT10-015";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { Phase } from "@aegis/shared/schema/enums";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/bot-pays-armor-purge.fixture";

it("pays Armor Purge to keep a Digimon an opponent's effect would delete", async () => {
  const setup = setupScenario(fixture);
  setup.state.phase = Phase.Main;
  await setup.ready();
  const policy = createEvaluationPolicy();
  const protectionRequests: DecisionRequest[] = [];
  expect(setup.engine.applyIntent(0, { type: "playCard", instanceId: setup.inst("trumpSword").instanceId })).toEqual({
    ok: true,
  });
  for (let answered = 0; answered < 10; answered += 1) {
    await settle(() => setup.engine.mainVerbContinuationsInFlight === 0 || setup.state.pendingDecision !== undefined);
    if (setup.state.pendingDecision === undefined) {
      break;
    }
    const request = setup.decisions.at(-1)!.req;
    if (request.options?.selectionGoal === DecisionSelectionGoal.PROTECT.value) {
      protectionRequests.push(request);
    }
    const intent = policy.answerDecision(buildBotView(setup.state, request.seat), request);
    expect(setup.engine.applyIntent(request.seat, intent)).toEqual({ ok: true });
  }
  expect(protectionRequests.map((request) => request.seat)).toEqual([1]);
  const survivor = setup.state.players[1]!.battleArea.find(
    (permanent) => permanent.permanentId === setup.perm("armor").permanentId,
  );
  expect(survivor?.topCard?.instanceId).toBe(setup.inst("promoted").instanceId);
});
