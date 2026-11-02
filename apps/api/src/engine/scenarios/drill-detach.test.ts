import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-detach.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import { buildBotView } from "#api/bot/view";

describe("detach drill", () => {
  it("trashes a Seven Code link to prevent Cocytus Breath and wins with the protected Digimon", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
      const host = s.perm("weatherdramon");
      expect(s.engine.applyIntent(1, policy.chooseMainAction(buildBotView(s.state, 1)!))).toEqual({ ok: true });
      await settle(() => host.linked.length === 0 && s.state.pendingDecision === undefined);
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === host.permanentId)).toBe(true);
      expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT26-010");
      expect(host.currentDP).toBe(5000);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: host });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
