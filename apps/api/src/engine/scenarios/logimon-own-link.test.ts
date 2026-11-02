import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/logimon-own-link.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";

describe("Logimon own link trigger", () => {
  it("does not play Kazuki and Itsuki when Rebootmon links during its attack", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
    preferred.push(s.inst("rebootmon").instanceId);
    await s.ready();
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("rebootmon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking() && !s.state.pendingDecision,
      );
      expect(s.perm("rebootmon").linked.map((card) => card.instanceId)).toContain(s.inst("link").instanceId);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("kazuki").instanceId);
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT25-089")).toBe(false);
      const effect = observe(s.engine).activatableEffects(s.perm("logimon"))[0];
      expect(effect).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("logimon").instanceId,
          effectKey: effect!.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT25-089") &&
          !s.state.pendingDecision,
      );
      expect(s.perm("logimon").linked.map((card) => card.instanceId)).toContain(s.inst("ownLink").instanceId);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("kazuki").instanceId);
    } finally {
      await finishTurnLoop({ setup: s, loop: turn });
    }
  });
  it("does not consume Logamon's own-link deletion when Rebootmon links", async () => {
    const configured = structuredClone(fixture);
    configured.board[0]!.battleArea = [
      { card: "BT25-070", as: "logamon" },
      { card: "BT25-060", as: "rebootmon" },
    ];
    configured.board[0]!.hand = [{ card: "BT25-007", as: "link" }];
    configured.board[0]!.trash = [{ card: "BT25-007", as: "ownLink" }];
    configured.board[1]!.battleArea = [{ card: "BT1-027", as: "target" }];
    const preferred: string[] = [];
    const s = setupScenario(configured, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferInstanceIds: preferred,
    });
    preferred.push(s.inst("rebootmon").instanceId);
    await s.ready();
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("rebootmon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking() && !s.state.pendingDecision,
      );
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
        s.inst("target").instanceId,
      );
      const effect = observe(s.engine).activatableEffects(s.perm("logamon"))[0];
      expect(effect).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("logamon").instanceId,
          effectKey: effect!.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("target").instanceId) &&
          !s.state.pendingDecision,
      );
      expect(s.perm("logamon").linked.map((card) => card.instanceId)).toContain(s.inst("ownLink").instanceId);
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
    } finally {
      await finishTurnLoop({ setup: s, loop: turn });
    }
  });
});
