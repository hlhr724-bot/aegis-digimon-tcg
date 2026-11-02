import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/practice-derived-trash-triggers.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("derived hand-trash trigger practice", () => {
  it("resolves the new inherited draw window before the older pending group, reaches Titamon, and wins", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      autoOrderTriggers: false,
      preferInstanceIds: preferred,
    });
    await s.ready();
    preferred.push(
      s.inst("first-discard").instanceId,
      s.inst("second-discard").instanceId,
      s.inst("turn-draw").instanceId,
    );
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const attacker = s.perm("ogremon");
      expect(attacker.currentDP).toBe(4000);
      expect(opponent.security).toHaveLength(3);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: attacker.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      const offered: string[][] = [];
      for (let step = 0; step < 16; step += 1) {
        await settle(
          () =>
            s.state.pendingDecision?.kind === "orderTriggers" || s.events.some((event) => event.kind === "attackEnded"),
        );
        const pending = s.state.pendingDecision;
        if (!pending) {
          break;
        }
        const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
        const cards = request.options!.triggerCardIds!;
        offered.push(cards);
        let selected = cards.indexOf("BT24-042");
        if (selected < 0) {
          selected = cards.indexOf("BT6-006");
        }
        expect(
          s.engine.applyIntent(pending.seat, {
            type: "respondDecision",
            decisionId: pending.decisionId,
            response: {
              kind: "orderTriggers",
              order: [request.options!.triggerKeys![Math.max(0, selected)]!],
            },
          }),
        ).toEqual({ ok: true });
      }
      await settle(() => s.state.pendingDecision === undefined && s.state.combatWindow === undefined);
      expect(offered.slice(0, 2)).toEqual([
        ["BT24-042", "BT6-006"],
        ["BT24-045", "BT6-006"],
      ]);
      const progress = s.events.flatMap((event) => {
        if (event.kind === "effectTriggered" && event.sourceCardId === "BT6-006") {
          return ["tsunomon"];
        }
        if (event.kind === "digivolved") {
          return [event.cardId];
        }
        return [];
      });
      expect(progress).toEqual(["BT24-072", "tsunomon", "BT25-084"]);
      expect(attacker.topCard.cardId).toBe("BT25-084");
      expect(attacker.stack.map((card) => card.cardId)).toEqual(["BT6-006", "BT24-042", "BT24-045", "BT24-072"]);
      expect(player.hand.some((card) => card.instanceId === s.inst("derived-draw").instanceId)).toBe(true);
      expect(opponent.battleArea).toHaveLength(0);
      expect(opponent.trash.map((card) => card.cardId)).toEqual(expect.arrayContaining(["BT14-011", "ST2-03"]));
      expect(opponent.trash.filter((card) => card.cardId === "ST2-10")).toHaveLength(3);
      expect(s.events.filter((event) => event.kind === "securityRevealed")).toHaveLength(2);
      expect(opponent.security).toHaveLength(0);
      expect(player.battleArea).toContain(attacker);
      expect(s.state.gameOver).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: s.perm("birdramon") });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
