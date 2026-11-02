import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-overclock.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("overclock drill", () => {
  it("checks security then deletes a Puppet to attack again while suspended through Overclock", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const shoeShoemon = s.perm("shoeShoemon");
      await attackPlayer({ setup: s, seat: 0, attacker: shoeShoemon });
      expect(shoeShoemon.isSuspended).toBe(true);
      expect(opponent.security).toHaveLength(0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const activation = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: activation.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      expect(player.trash.some((card) => card.cardId === "ST19-03")).toBe(true);
      const target = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: target.decisionId,
          response: { kind: "selectCards", instanceIds: ["player"] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.gameOver);
      expect(player.trash.some((card) => card.cardId === "ST19-03")).toBe(true);
      expect(shoeShoemon.isSuspended).toBe(true);
      expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(2);
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
