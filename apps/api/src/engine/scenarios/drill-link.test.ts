import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-link.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

describe("link drill", () => {
  it("keeps two link cards through Link plus one and then wins after its security attack", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const host = s.perm("deusmon");
      expect(host.linked).toHaveLength(1);
      const originalLink = host.linked[0]!.instanceId;
      expect(
        s.engine.applyIntent(0, {
          type: "linkCard",
          instanceId: s.inst("navimon").instanceId,
          targetPermanentId: host.permanentId,
        }),
      ).toEqual({ ok: true });
      await settle(() => host.linked.length === 2 && s.state.pendingDecision === undefined);
      expect(host.linked.map((card) => card.cardId)).toEqual(["BT21-047", "BT21-047"]);
      expect(host.linked.map((card) => card.instanceId)).toContain(originalLink);
      expect(s.state.players[0]!.trash).toHaveLength(0);
      expect(s.state.memory).toBe(1);
      await attackPlayer({ setup: s, seat: 0, attacker: host });
      expect(s.state.players[1]!.security).toHaveLength(0);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("finisher") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
