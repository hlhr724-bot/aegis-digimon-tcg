import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import fixture from "#api/engine/scenarios/drill-recovery.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("recovery drill", () => {
  it("adds a security card with Angewomon, survives the scripted attack, and wins next turn", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const gatomon = s.perm("gatomon");
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: gatomon.permanentId,
          target: { kind: "player" },
        }).ok,
      ).toBe(false);
      expect(player.security).toHaveLength(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: gatomon.permanentId,
          instanceId: s.inst("angewomon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => player.security.length === 1 && s.state.pendingDecision === undefined);
      expect(gatomon.topCard.cardId).toBe("ST3-09");
      expect(player.security.map((card) => card.cardId)).toEqual(["ST3-02"]);
      expect(s.state.memory).toBe(0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      const attack = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(attack).toMatchObject({ type: "attack", attackerPermanentId: s.perm("ikkakumon").permanentId });
      expect(s.engine.applyIntent(1, attack)).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") &&
          s.state.combatWindow === undefined &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.gameOver).toBe(false);
      expect(player.security).toHaveLength(0);
      expect(policy.chooseMainAction(buildBotView(s.state, 1)!)).toEqual({ type: "endPhase" });
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: gatomon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
