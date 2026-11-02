import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-collision.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";

describe("collision drill", () => {
  it("forces a nonblocker to block Proganomon and pierces security before the winning hit", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const proganomon = s.perm("proganomon");
      const gomamon = s.perm("gomamon");
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: proganomon.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "block");
      expect(s.state.combatWindow!.eligiblePermanentIds).toContain(gomamon.permanentId);
      expect(s.engine.applyIntent(1, { type: "declineBlock" }).ok).toBe(false);
      const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
      const window = s.state.combatWindow!;
      const block = policy.chooseBlockResponse(buildBotView(s.state, 1)!, {
        attackerPermanentId: proganomon.permanentId,
        eligibleBlockerIds: [...window.eligiblePermanentIds],
        mustBlock: true,
        targetsPlayer: true,
      });
      expect(block).toEqual({ type: "declareBlock", blockerPermanentId: gomamon.permanentId });
      expect(s.engine.applyIntent(1, block)).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") && !s.state.combatWindow && !s.state.pendingDecision,
      );
      expect(opponent.trash.some((card) => card.cardId === "ST2-02")).toBe(true);
      expect(opponent.security).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
