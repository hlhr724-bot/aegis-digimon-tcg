import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import fixture from "#api/engine/scenarios/drill-reboot.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("reboot drill", () => {
  it("unsuspends WarGreymon on the opponent's turn so it can block, then wins next turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const warGreymon = s.perm("warGreymon");
    expect(warGreymon.isSuspended).toBe(true);
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      expect(warGreymon.isSuspended).toBe(false);
      const attack = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(attack).toMatchObject({ type: "attack", attackerPermanentId: s.perm("ikkakumon").permanentId });
      expect(s.engine.applyIntent(1, attack)).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "block" && s.state.combatWindow.seat === 0);
      expect([...s.state.combatWindow!.eligiblePermanentIds]).toEqual([warGreymon.permanentId]);
      expect(player.security).toHaveLength(0);
      expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: warGreymon.permanentId })).toEqual({
        ok: true,
      });
      await settle(() => opponent.battleArea.length === 0 && s.state.combatWindow === undefined);
      expect(s.state.gameOver).toBe(false);
      expect(warGreymon.isSuspended).toBe(true);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: warGreymon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
