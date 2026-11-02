import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-vortex.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";

describe("vortex drill", () => {
  it("uses a freshly played Galemon Vortex attack at turn end to remove a blocker and win next turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("galemon").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => player.battleArea.some((card) => card.topCard.cardId === "ST18-08") && !s.state.pendingDecision,
      );
      const galemon = player.battleArea.find((card) => card.topCard.cardId === "ST18-08")!;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: galemon.permanentId,
          target: { kind: "permanent", permanentId: s.perm("monochromon").permanentId },
        }).ok,
      ).toBe(false);
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
          opponent.trash.some((card) => card.cardId === "BT14-011") &&
          !s.state.pendingDecision &&
          !s.state.combatWindow,
      );
      expect(galemon.isSuspended).toBe(true);
      await advance(s.engine).waitForMainPhase(1);
      const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
      const pass = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(pass).toEqual({ type: "endPhase" });
      expect(s.engine.applyIntent(1, pass)).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: galemon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
