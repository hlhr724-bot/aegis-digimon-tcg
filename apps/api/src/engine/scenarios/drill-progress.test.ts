import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-progress.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";

describe("progress drill", () => {
  it("ignores Cocytus Breath while attacking through Progress and wins on the following turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const dimetromon = s.perm("dimetromon");
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: dimetromon.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.pendingDecision !== undefined || s.events.some((event) => event.kind === "attackEnded"),
      );
      const responses: { ok: boolean }[] = [];
      if (s.state.pendingDecision) {
        const request = s.decisions.findLast(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
        const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
        const response = policy.answerDecision(buildBotView(s.state, 1)!, request);
        responses.push(s.engine.applyIntent(1, response));
      }
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") && !s.state.combatWindow && !s.state.pendingDecision,
      );
      expect(responses.every((response) => response.ok)).toBe(true);
      expect(opponent.security).toHaveLength(0);
      expect(player.battleArea).toContain(dimetromon);
      expect(player.hand.some((card) => card.cardId === "P-189")).toBe(false);
      expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "ST2-16")).toBe(true);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
      const pass = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(pass).toEqual({ type: "endPhase" });
      expect(s.engine.applyIntent(1, pass)).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: dimetromon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
