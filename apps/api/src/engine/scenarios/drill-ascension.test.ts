import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-ascension.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import { buildBotView } from "#api/bot/view";

describe("ascension drill", () => {
  it("places a defeated Digimon in security to survive the bot and wins with the waiting Birdramon", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("scourge").permanentId,
          target: { kind: "permanent", permanentId: s.perm("attacker").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.security.length === 1 &&
          s.state.pendingDecision === undefined &&
          s.state.combatWindow === undefined,
      );
      expect(s.state.players[0]!.security[0]!.cardId).toBe("BT26-075");
      expect(s.state.players[0]!.security[0]!.faceUp).toBe(false);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
      await attackPlayer({ setup: s, seat: 1, attacker: s.perm("attacker") });
      expect(policy.chooseMainAction(buildBotView(s.state, 1)!)).toEqual({ type: "endPhase" });
      expect(s.state.players[0]!.security).toHaveLength(0);
      expect(s.state.gameOver).toBe(false);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("finisher") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
