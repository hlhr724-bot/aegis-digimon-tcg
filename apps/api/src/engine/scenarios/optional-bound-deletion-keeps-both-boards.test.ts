import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/optional-bound-deletion-keeps-both-boards.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

it("keeps both boards when an accepted optional binding is declined after paying the preceding placement", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("giromon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("placement").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual([
      "BT26-055",
      "BT26-055",
    ]);
    expect(s.state.players[0]!.battleArea[1]!.stack[0]!.instanceId).toBe(s.inst("placement").instanceId);
    expect(s.perm("opponent").topCard.cardId).toBe("BT1-009");
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
