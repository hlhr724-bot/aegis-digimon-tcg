import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/temple-delay-named-forms.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";

describe("Temple of Beginnings named forms", () => {
  it.each(["BT24-014", "BT26-029", "BT26-103"])(
    "can use aged Delay with stacked %s after a public security check",
    async (card) => {
      const configured = structuredClone(fixture);
      configured.board[1]!.battleArea = [
        { card: "BT24-093", as: "temple", placedByEffect: true, enterFieldTurnCount: 7 },
        { card, as: "host", under: [{ card: "BT1-009", as: "under" }] },
      ];
      const s = setupScenario(configured, { autoAcceptOptional: true, autoSelectCards: true });
      await s.ready();
      const turn = s.engine.runOneTurn();
      try {
        await advance(s.engine).waitForMainPhase(0);
        expect(
          s.engine.applyIntent(0, {
            type: "attack",
            attackerPermanentId: s.perm("attacker").permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        const responses = [];
        await settle(
          () =>
            s.engine.combat.hasOpenCounterWindow ||
            s.engine.combat.hasOpenBlockWindow ||
            s.events.some((event) => event.kind === "securityChecked"),
        );
        if (s.engine.combat.hasOpenCounterWindow) {
          responses.push(s.engine.applyIntent(1, { type: "respondCounter" }));
        }
        await settle(
          () => s.engine.combat.hasOpenBlockWindow || s.events.some((event) => event.kind === "securityChecked"),
        );
        if (s.engine.combat.hasOpenBlockWindow) {
          responses.push(s.engine.applyIntent(1, { type: "declineBlock" }));
        }
        await settle(
          () =>
            s.events.some((event) => event.kind === "securityChecked") &&
            !observe(s.engine).isAttacking() &&
            !s.state.pendingDecision,
        );
        expect(responses.every((result) => result.ok)).toBe(true);
        expect(s.state.players[1]!.security.map((instance) => instance.instanceId)).toContain(
          s.inst("host").instanceId,
        );
        expect(s.state.players[1]!.trash.map((instance) => instance.instanceId)).toContain(s.inst("temple").instanceId);
        expect(s.perm("host").topCard.instanceId).toBe(s.inst("under").instanceId);
      } finally {
        await finishTurnLoop({ setup: s, loop: turn });
      }
    },
  );
  it.each(["unrelated", "unstacked", "opponent"] as const)("does not use aged Delay for an %s host", async (mode) => {
    const configured = structuredClone(fixture);
    configured.board = {
      0: {
        battleArea: [
          { card: "BT24-093", as: "temple", placedByEffect: true, enterFieldTurnCount: 7 },
          { card: "BT1-058", as: "yellowSource" },
          {
            card: mode === "unstacked" ? "BT26-029" : "BT1-060",
            as: "host",
            under: mode === "unstacked" ? [] : ["BT1-009"],
          },
        ],
        hand: [{ card: "BT4-104", as: "ray" }],
        security: ["BT1-009", "BT1-009"],
        deck: ["BT1-009", "BT1-009"],
      },
      1: {
        battleArea: mode === "opponent" ? [{ card: "BT26-029", under: ["BT1-009"] }] : [],
        deck: ["BT1-009", "BT1-009"],
      },
    };
    const s = setupScenario(configured, { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ray").instanceId })).toEqual({ ok: true });
      await settle(
        () => s.state.players[0]!.trash.some((card) => card.cardId === "BT4-104") && !s.state.pendingDecision,
      );
      expect(s.state.players[0]!.security).toHaveLength(1);
      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain("BT24-093");
      expect(s.state.players[0]!.trash.map((card) => card.cardId)).not.toContain("BT24-093");
    } finally {
      await finishTurnLoop({ setup: s, loop: turn });
    }
  });
});
