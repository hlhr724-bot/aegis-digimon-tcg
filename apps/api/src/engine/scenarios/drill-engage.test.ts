import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-engage.fixture";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("engage drill", () => {
  it("accepts the end of turn Engage attack and wins while memory belongs to the bot", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const optional = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: optional.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      expect(s.state.memory).toBe(-3);
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const selection = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: selection.decisionId,
          response: { kind: "selectCards", instanceIds: ["player"] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.gameOver);
      expect(
        s.events.some(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "EX13-013" && event.timing === "OnEndTurn",
        ),
      ).toBe(true);
      expect(s.perm("warGrowlmon").isSuspended).toBe(true);
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
