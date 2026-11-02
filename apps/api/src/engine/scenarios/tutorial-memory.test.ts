import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/tutorial-memory.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("memory lesson", () => {
  it("passes the turn when paid memory crosses to the opponent, then wins next turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("biyomon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => player.battleArea.length === 1);
      expect(s.state.memory).toBe(1);
      expect(s.state.turnSeat).toBe(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("birdramon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.turnSeat === 1);
      expect(player.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["ST1-02", "ST1-05"]);
      await runFixtureBotTurn({ setup: s, fixture });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.memory).toBe(3);
      const [biyomon, birdramon] = player.battleArea;
      await attackPlayer({ setup: s, seat: 0, attacker: birdramon! });
      expect(s.state.players[1]!.security).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: biyomon! });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
