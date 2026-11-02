import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import fixture from "#api/engine/scenarios/execute-security-deletion-reaction-order.fixture";

describe("Execute security battle preserves deletion reaction order", () => {
  it.each([false, true])("respects the selected reaction order with Ascension first: %s", async (ascensionFirst) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false });
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      advance(s.engine).endMainPhaseIfOpen(0);
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const pending = s.state.pendingDecision!;
      const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
      const index = request.options!.triggerTimings!.indexOf(ascensionFirst ? "Ascension" : "OnDeletion");
      expect(index).toBe(ascensionFirst ? 0 : 1);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "orderTriggers", order: [], orderIndexes: [index] },
        }),
      ).toEqual({ ok: true });
      await turn;
      expect(
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("revived").instanceId),
      ).toBe(!ascensionFirst);
      expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("cost").instanceId)).toBe(
        !ascensionFirst,
      );
      expect(s.state.players[0]!.security.some(({ instanceId }) => instanceId === s.inst("scourge").instanceId)).toBe(
        true,
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await turn;
    }
  });
});
