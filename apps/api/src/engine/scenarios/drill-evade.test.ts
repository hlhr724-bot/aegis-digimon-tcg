import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-evade.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import { settle } from "#api/engine/testkit/harness";

describe("evade drill", () => {
  it("suspends Syakomon to prevent Gaia Force deletion and wins after unsuspending", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, { autoSelectCards: true, preferInstanceIds: preferred });
    await s.ready();
    preferred.push(s.perm("hero").topCard.instanceId);
    const hero = s.perm("hero");
    const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const action = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(action).toMatchObject({ type: "playCard", instanceId: s.inst("removal").instanceId });
      expect(s.engine.applyIntent(1, action)).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "evadePrompt"));
      expect(s.engine.applyIntent(0, { type: "respondEvade", permanentId: hero.permanentId, accept: true })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.state.players[1]!.trash.some((card) => card.cardId === "ST1-16") &&
          s.engine.mainVerbContinuationsInFlight === 0,
      );
      expect(s.state.players[0]!.battleArea).toContain(hero);
      expect(hero.isSuspended).toBe(true);
      expect(s.state.players[0]!.trash.map((card) => card.cardId)).not.toContain("BT14-021");
      await runFixtureBotTurn({ setup: s, fixture });
      await advance(s.engine).waitForMainPhase(0);
      expect(hero.isSuspended).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: hero });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
