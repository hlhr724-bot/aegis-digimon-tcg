import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-guard.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("guard drill", () => {
  it("sacrifices Gladimon to prevent Cocytus Breath returning BigMamemon and wins", async () => {
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
      expect(player.trash.map((card) => card.cardId)).toContain("EX13-052");
      expect(player.hand.map((card) => card.cardId)).not.toContain("BT6-063");
      expect(player.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT6-063"]);
      expect(s.perm("hero").permanentId).toBe(originalPermanentId);
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("hero") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
