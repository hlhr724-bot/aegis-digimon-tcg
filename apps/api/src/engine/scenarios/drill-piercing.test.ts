import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import fixture from "#api/engine/scenarios/drill-piercing.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("piercing drill", () => {
  it("checks security after WezenGammamon deletes the scripted blocker and wins with Birdramon", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const wezenGammamon = s.perm("wezenGammamon");
      const monochromon = s.perm("monochromon");
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: wezenGammamon.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "block" && s.state.combatWindow.seat === 1);
      const window = s.state.combatWindow!;
      const block = policy.chooseBlockResponse(buildBotView(s.state, 1)!, {
        attackerPermanentId: window.attackerPermanentId,
        eligibleBlockerIds: [...window.eligiblePermanentIds],
        mustBlock: false,
        targetsPlayer: true,
      });
      expect(block).toEqual({ type: "declareBlock", blockerPermanentId: monochromon.permanentId });
      expect(s.engine.applyIntent(1, block)).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") &&
          s.state.combatWindow === undefined &&
          s.state.pendingDecision === undefined,
      );
      expect(opponent.battleArea).toHaveLength(0);
      expect(opponent.security).toHaveLength(0);
      expect(opponent.trash.map((card) => card.cardId).sort()).toEqual(["BT14-011", "ST2-04"]);
      expect(s.state.players[0]!.battleArea).toContain(wezenGammamon);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
