import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-draw.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("draw drill", () => {
  it("draws BushiAgumon with Gabumon and wins with its Rush attack", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(player.hand.map((card) => card.cardId)).toEqual(["BT1-029", "ST1-10"]);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gabumon").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => player.hand.some((card) => card.cardId === "BT4-038") && s.state.pendingDecision === undefined,
      );
      expect(s.state.memory).toBe(5);
      const drawn = player.hand.find((card) => card.cardId === "BT4-038")!;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: drawn.instanceId })).toEqual({ ok: true });
      await settle(() => player.battleArea.some((permanent) => permanent.topCard.cardId === "BT4-038"));
      expect(s.state.memory).toBe(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.players[1]!.security).toHaveLength(0);
      const bushiAgumon = player.battleArea.find((permanent) => permanent.topCard.cardId === "BT4-038")!;
      await attackPlayer({ setup: s, seat: 0, attacker: bushiAgumon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
