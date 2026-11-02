import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-save.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

describe("save drill", () => {
  it("Saves Shoutmon under Taiki and reuses that exact saved card to give the winning DigiXros Rush", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      preferInstanceIds: preferred,
    });
    await s.ready();
    preferred.push(s.perm("hero").topCard.instanceId);
    const savedId = s.perm("hero").topCard.instanceId;
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await runFixtureBotTurn({ setup: s, fixture });
      expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([savedId]);
      expect(player.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT10-087"]);
      expect(player.trash.map((card) => card.cardId)).not.toContain("BT10-008");
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.memory).toBe(3);
      expect(
        s.engine.applyIntent(0, {
          type: "playCard",
          instanceId: s.inst("replacement").instanceId,
          digiXros: {
            materialInstanceIds: s.perm("tamer").stack.map((card) => card.instanceId),
            expanderPermanentIds: [s.perm("tamer").permanentId],
          },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          player.battleArea.some((permanent) => permanent.topCard.cardId === "BT10-111") &&
          !s.state.pendingDecision &&
          s.engine.mainVerbContinuationsInFlight === 0,
      );
      const winner = player.battleArea.find((permanent) => permanent.topCard.cardId === "BT10-111")!;
      expect(winner.stack.map((card) => card.instanceId)).toContain(savedId);
      expect(s.perm("tamer").isSuspended).toBe(true);
      expect(s.perm("tamer").stack).toHaveLength(0);
      expect(s.state.memory).toBe(0);
      await attackPlayer({ setup: s, seat: 0, attacker: winner });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
