import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-use-req.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

describe("use-req drill", () => {
  it("uses a white Option with only yellow BEATBREAK support, recruits a Digimon, and wins", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["ST23-02"]);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pulse").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "ST23-15") &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.players[0]!.battleArea.filter((permanent) => permanent.topCard.cardId === "ST23-02")).toHaveLength(
        2,
      );
      expect(s.state.memory).toBe(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("liollmon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
