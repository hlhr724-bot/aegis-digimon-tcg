import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-execute.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";

describe("execute drill", () => {
  it("attacks an unsuspended blocker with Execute then pays its own deletion before winning next turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const phantomon = s.perm("phantomon");
      expect(s.perm("monochromon").isSuspended).toBe(false);
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
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const selection = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: selection.decisionId,
          response: { kind: "selectCards", instanceIds: [s.perm("monochromon").permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          player.trash.some((card) => card.cardId === "BT20-072") && !s.state.pendingDecision && !s.state.combatWindow,
      );
      expect(opponent.trash.some((card) => card.cardId === "BT14-011")).toBe(true);
      expect(player.battleArea).not.toContain(phantomon);
      await advance(s.engine).waitForMainPhase(1);
      const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
      const pass = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(pass).toEqual({ type: "endPhase" });
      expect(s.engine.applyIntent(1, pass)).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
