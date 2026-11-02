import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/practice-rule-checks.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("rule checks practice", () => {
  it("uses DP reduction to delete a blocker at the rule check and wins through the cleared board", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true });
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const blockerId = s.perm("blocker").permanentId;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.perm("blocker").currentDP).toBe(5000);
      expect(
        s.engine.applyIntent(0, {
          type: "playCard",
          instanceId: s.inst("seven-heavens").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          opponent.battleArea.length === 0 && !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0,
      );
      expect(opponent.trash.map((card) => card.cardId)).toEqual(["BT14-011"]);
      expect(player.trash.map((card) => card.cardId)).toEqual(["ST3-16"]);
      expect(
        s.events.some(
          (event) =>
            event.kind === "cardsMoved" &&
            event.deletedPermanents?.some((permanent) => permanent.permanentId === blockerId),
        ),
      ).toBe(true);
      expect(s.state.memory).toBe(2);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("salamon") });
      expect(s.events.some((event) => event.kind === "blockWindowOpened")).toBe(false);
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
