import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-decode.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("decode drill", () => {
  it("plays Sistermon Blanc before Cocytus Breath returns its awakened form and wins with the decoded card", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      preferInstanceIds: preferred,
    });
    await s.ready();
    preferred.push(s.perm("hero").topCard.instanceId);
    const originalPermanentId = s.perm("hero").permanentId;
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await runFixtureBotTurn({ setup: s, fixture });
      expect(player.hand.map((card) => card.cardId)).toContain("EX13-065");
      expect(player.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT6-082"]);
      expect(player.battleArea[0]!.permanentId).not.toBe(originalPermanentId);
      expect(player.trash.map((card) => card.cardId)).not.toContain("BT6-082");
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: player.battleArea[0]! });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
