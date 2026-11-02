import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-iceclad.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("iceclad drill", () => {
  it("wins a battle against a much stronger Digimon by comparing source counts through Iceclad", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const polarBearmon = s.perm("polarBearmon");
      const warGreymon = s.perm("warGreymon");
      expect(polarBearmon.currentDP).toBeLessThan(warGreymon.currentDP);
      expect(polarBearmon.stack).toHaveLength(2);
      expect(warGreymon.stack).toHaveLength(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: polarBearmon.permanentId,
          target: { kind: "permanent", permanentId: warGreymon.permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") && !s.state.combatWindow && !s.state.pendingDecision,
      );
      expect(player.battleArea).toContain(polarBearmon);
      expect(opponent.trash.some((card) => card.cardId === "ST1-11")).toBe(true);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
