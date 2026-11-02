import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-training.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import { observe } from "#api/engine/testkit/observe";

describe("training drill", () => {
  it("trains a face-down source so Greymon gains enough DP to beat the blocker and win", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const greymon = s.perm("greymon");
      const topDeck = player.deck[0]!;
      const training = observe(s.engine).activatableEffects(greymon)[0]!;
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: greymon.topCard.instanceId,
          effectKey: training.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => greymon.stack.length === 1 && !s.state.pendingDecision);
      expect(greymon.stack[0]!.instanceId).toBe(topDeck.instanceId);
      expect(greymon.stack[0]!.faceUp).toBe(false);
      expect(greymon.isSuspended).toBe(true);
      expect(s.state.memory).toBe(3);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      const pass = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(pass).toEqual({ type: "endPhase" });
      expect(s.engine.applyIntent(1, pass)).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(greymon.currentDP).toBe(5000);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: greymon.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const buff = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: buff.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "block");
      expect(greymon.stack).toHaveLength(2);
      expect(greymon.currentDP).toBe(7000);
      const window = s.state.combatWindow!;
      const block = policy.chooseBlockResponse(buildBotView(s.state, 1)!, {
        attackerPermanentId: greymon.permanentId,
        eligibleBlockerIds: [...window.eligiblePermanentIds],
        mustBlock: false,
        targetsPlayer: true,
      });
      expect(block).toEqual({ type: "declareBlock", blockerPermanentId: s.perm("grizzlymon").permanentId });
      expect(s.engine.applyIntent(1, block)).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") && !s.state.combatWindow && !s.state.pendingDecision,
      );
      expect(opponent.trash.some((card) => card.cardId === "ST2-07")).toBe(true);
      expect(player.battleArea).toContain(greymon);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("dracomon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
