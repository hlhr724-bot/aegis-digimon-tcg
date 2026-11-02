import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-raid.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("raid drill", () => {
  it("redirects Grizzlymon onto the unsuspended highest DP blocker with Raid before the winning hit", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const grizzlymon = s.perm("grizzlymon");
      const monochromon = s.perm("monochromon");
      expect(monochromon.isSuspended).toBe(false);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: grizzlymon.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const selection = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: selection.decisionId,
          response: { kind: "selectCards", instanceIds: [monochromon.topCard.instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") && !s.state.combatWindow && !s.state.pendingDecision,
      );
      expect(opponent.trash.some((card) => card.cardId === "BT14-011")).toBe(true);
      expect(
        s.events.some(
          (event) =>
            event.kind === "attackDeclared" &&
            event.redirected &&
            event.target.kind === "permanent" &&
            event.target.permanentId === monochromon.permanentId,
        ),
      ).toBe(true);
      expect(player.battleArea).toContain(grizzlymon);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
