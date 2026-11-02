import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-partition.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("partition drill", () => {
  it("plays both required level fours from Paildramon before its deletion and wins with Ikkakumon", async () => {
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
      expect(player.trash.map((card) => card.cardId)).toContain("BT16-025");
      expect(player.battleArea.map((permanent) => permanent.topCard.cardId).sort()).toEqual(["ST2-05", "ST4-06"]);
      expect(player.battleArea.every((permanent) => permanent.permanentId !== originalPermanentId)).toBe(true);
      expect(player.battleArea.every((permanent) => permanent.stack.length === 0)).toBe(true);
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({
        setup: s,
        seat: 0,
        attacker: player.battleArea.find((permanent) => permanent.topCard.cardId === "ST2-05")!,
      });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
