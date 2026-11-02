import type { Intent } from "@aegis/shared/protocol/intents";
import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/granted-deletion-controller.fixture";
import "#api/cards/index";

it("lets the recipient controller choose which of their Digimon a granted deletion removes", async () => {
  const s = setupScenario(fixture);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("fascination").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).subscriptions("endOfTurn").length === 2 && !s.state.pendingDecision);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const request = s.decisions.at(-1)!.req;
    const intent: Intent = {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "chooseTargets", instanceIds: [s.perm("second").permanentId] },
    };
    expect(s.engine.applyIntent(request.seat === 0 ? 1 : 0, intent).ok).toBe(false);
    expect(s.engine.applyIntent(request.seat, intent)).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("first").permanentId,
    ]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("second").instanceId]),
    );
    expect(s.state.pendingDecision).toBeUndefined();
    expect(request.seat).toBe(1);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
