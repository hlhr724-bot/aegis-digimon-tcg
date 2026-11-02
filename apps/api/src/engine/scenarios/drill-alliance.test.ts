import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-alliance.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("alliance drill", () => {
  it("suspends the new Dracomon for Alliance to check both security cards and wins with Birdramon", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const turuiemon = s.perm("turuiemon");
      const dracomon = s.perm("dracomon");
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: dracomon.permanentId,
          target: { kind: "player" },
        }).ok,
      ).toBe(false);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: turuiemon.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "alliance");
      expect(s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: dracomon.permanentId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") &&
          s.state.combatWindow === undefined &&
          s.state.pendingDecision === undefined,
      );
      expect(dracomon.isSuspended).toBe(true);
      expect(opponent.security).toHaveLength(0);
      expect(s.state.players[0]!.battleArea).toContain(turuiemon);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
