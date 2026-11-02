import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { settle } from "../testkit/harness.js";
import { setupScenario } from "../testkit/scenario.js";
import fixture from "./retriggered-tamer-orders-with-new-digivolution.fixture.js";

describe("a Tamer watcher that triggers again inside an effect chain", () => {
  it("is offered beside the new [When Digivolving] effect, so it can resolve first", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      autoOrderTriggers: false,
      preferInstanceIds: preferred,
    });
    preferred.push(s.inst("birdramon").instanceId, s.inst("agumon").instanceId, s.inst("togemon").instanceId);
    s.state.phase = Phase.Main;
    await s.ready();
    const answerOrder = async (firstCardId?: string): Promise<void> => {
      const request = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
      const keys = request.options!.triggerKeys!;
      const index = firstCardId === undefined ? 0 : request.options!.triggerCardIds!.indexOf(firstCardId);
      expect(index).toBeGreaterThanOrEqual(0);
      const order = [keys[index]!, ...keys.filter((_, position) => position !== index)];
      const optionalAnswers = Object.fromEntries(keys.map((key) => [key, true]));
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "orderTriggers", order, optionalAnswers },
        }),
      ).toEqual({ ok: true });
    };
    const togemonInPlay = (): boolean =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("togemon").instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mattAndTk").instanceId })).toEqual({
      ok: true,
    });

    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    await answerOrder("ST20-03");
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const angewomonPrompt = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
    expect(angewomonPrompt.options!.triggerCardIds).toEqual(expect.arrayContaining(["ST20-06", "AD1-019"]));
    expect(angewomonPrompt.options!.waitingTriggerCardIds).toEqual(["AD1-019"]);
    await answerOrder("AD1-019");
    for (let step = 0; step < 10; step += 1) {
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers" || s.state.pendingDecision === undefined);
      if (s.state.pendingDecision === undefined) break;
      await answerOrder();
    }

    await settle(() => s.state.pendingDecision === undefined && togemonInPlay());
    const togemon = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("togemon").instanceId,
    )!;
    expect(togemon.stack.map(({ instanceId }) => instanceId)).toContain(s.inst("agumon").instanceId);
    expect(s.perm("biyomon").topCard.instanceId).toBe(s.inst("angewomon").instanceId);
  });
});
