import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/practice-game-preparation.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("game preparation practice", () => {
  it("starts with five cards and five security at zero memory, raises a Digimon, and wins by a final direct attack", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true });
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    expect(player.hand).toHaveLength(5);
    expect(player.security).toHaveLength(5);
    expect(player.deck).toHaveLength(40);
    expect(opponent.hand).toHaveLength(5);
    expect(opponent.security).toHaveLength(5);
    expect(opponent.deck).toHaveLength(40);
    expect(s.state.memory).toBe(0);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.engine.breeding.isOpen && s.state.turnSeat === 0);
      expect(player.hand).toHaveLength(5);
      expect(player.deck).toHaveLength(40);
      expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      const raised = s.perm("egg");
      expect(raised.topCard.cardId).toBe("ST1-01");
      expect(player.eggDeck).toHaveLength(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: raised.permanentId,
          instanceId: s.inst("agumon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => raised.topCard.cardId === "ST1-03" && !s.state.pendingDecision);
      expect(s.state.memory).toBe(0);
      expect(player.deck).toHaveLength(39);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: raised.permanentId,
          instanceId: s.inst("greymon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => raised.topCard.cardId === "ST1-07" && s.state.turnSeat === 1);
      expect(player.deck).toHaveLength(38);
      expect(raised.stack.map((card) => card.cardId)).toEqual(["ST1-01", "ST1-03"]);
      await runFixtureBotTurn({ setup: s, fixture });
      await settle(() => s.engine.breeding.isOpen && s.state.turnSeat === 0);
      expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: raised.permanentId })).toEqual({
        ok: true,
      });
      await advance(s.engine).waitForMainPhase(0);
      expect(player.breeding).toBeUndefined();
      expect(player.battleArea).toContain(raised);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: raised.permanentId,
          instanceId: s.inst("garudamon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          raised.topCard.cardId === "ST1-08" &&
          !s.state.pendingDecision &&
          s.engine.mainVerbContinuationsInFlight === 0,
      );
      expect(raised.stack.map((card) => card.cardId)).toEqual(["ST1-01", "ST1-03", "ST1-07"]);
      await attackPlayer({ setup: s, seat: 0, attacker: raised });
      expect(opponent.security).toHaveLength(3);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("biyomon").instanceId })).toEqual({
        ok: true,
      });
      await runFixtureBotTurn({ setup: s, fixture });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: raised });
      expect(opponent.security).toHaveLength(1);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await runFixtureBotTurn({ setup: s, fixture });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: raised });
      expect(opponent.security).toHaveLength(0);
      expect(s.state.gameOver).toBe(false);
      const biyomon = player.battleArea.find(
        (permanent) => permanent.topCard.instanceId === s.inst("biyomon").instanceId,
      )!;
      await attackPlayer({ setup: s, seat: 0, attacker: biyomon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
