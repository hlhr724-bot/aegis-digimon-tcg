import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/tutorial-hatch.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("hatch lesson", () => {
  it("moves a raised Digimon out, waits out summoning sickness, hatches an egg, and wins", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.engine.breeding.isOpen && s.state.turnSeat === 0);
      const dracomon = s.perm("dracomon");
      expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: dracomon.permanentId })).toEqual({
        ok: true,
      });
      await advance(s.engine).waitForMainPhase(0);
      expect(player.breeding).toBeUndefined();
      expect(player.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["ST1-04"]);
      const biyomonCard = player.hand.find((card) => card.cardId === "ST1-02")!;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: biyomonCard.instanceId })).toEqual({ ok: true });
      await settle(() => player.battleArea.some((permanent) => permanent.topCard.cardId === "ST1-02"));
      expect(s.state.memory).toBe(1);
      const biyomon = player.battleArea.find((permanent) => permanent.topCard.cardId === "ST1-02")!;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: biyomon.permanentId,
          target: { kind: "player" },
        }).ok,
      ).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: dracomon });
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.gameOver).toBe(false);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await runFixtureBotTurn({ setup: s, fixture });
      await settle(() => s.engine.breeding.isOpen && s.state.turnSeat === 0);
      expect(s.state.memory).toBe(3);
      expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(player.breeding?.topCard.instanceId).toBe(s.inst("next-egg").instanceId);
      expect(s.state.phase).toBe(Phase.Main);
      await attackPlayer({ setup: s, seat: 0, attacker: biyomon });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
