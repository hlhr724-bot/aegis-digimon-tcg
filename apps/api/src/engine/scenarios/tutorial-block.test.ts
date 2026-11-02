import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import fixture from "#api/engine/scenarios/tutorial-block.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("block lesson", () => {
  it("blocks the scripted bot attack with a Blocker and wins on the next turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const attack = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(attack).toMatchObject({ type: "attack", attackerPermanentId: s.perm("gomamon").permanentId });
      expect(s.engine.applyIntent(1, attack)).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "block" && s.state.combatWindow.seat === 0);
      const monochromon = s.perm("monochromon");
      expect([...s.state.combatWindow!.eligiblePermanentIds]).toEqual([monochromon.permanentId]);
      expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: monochromon.permanentId })).toEqual({
        ok: true,
      });
      await settle(() => opponent.battleArea.length === 0 && s.state.combatWindow === undefined);
      expect(monochromon.isSuspended).toBe(true);
      expect(s.state.players[0]!.security).toHaveLength(3);
      expect(opponent.trash.map((card) => card.cardId)).toEqual(["ST2-02"]);
      const pass = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(pass).toEqual({ type: "endPhase" });
      expect(s.engine.applyIntent(1, pass)).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(monochromon.isSuspended).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: monochromon });
      expect(opponent.security).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
