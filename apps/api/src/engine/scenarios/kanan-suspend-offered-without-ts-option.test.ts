import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/kanan-suspend-offered-without-ts-option.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

describe("Kanan Yuki offers its suspension cost without a usable TS Option", () => {
  it.each([
    { accept: true, suspended: true },
    { accept: false, suspended: false },
  ])("End of Your Turn asks first and honors accept=$accept", async ({ accept, suspended }) => {
    const s = setupScenario(fixture);
    await s.ready();
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const handBefore = s.state.players[0]!.hand.map((card) => card.instanceId);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision !== undefined);
      const request = s.state.pendingDecision!;
      expect(request.kind).toBe("optional");
      expect(request.seat).toBe(0);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
      await turn;
      expect(s.perm("kanan").isSuspended).toBe(suspended);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(handBefore);
      expect(s.state.players[0]!.trash).toHaveLength(0);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await turn.catch(() => undefined);
    }
  });
});
