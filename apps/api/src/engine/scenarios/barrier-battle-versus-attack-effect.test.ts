import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/barrier-battle-versus-attack-effect.fixture";
import "#api/cards/EX12/EX12-076";
import "#api/cards/BT26/BT26-103";
import "#api/cards/BT24/BT24-034";
import "#api/cards/BT24/BT24-101";

describe("Barrier distinguishes battle deletion from an attacking effect", () => {
  it("offers Jupitermon's leave protection, but not Barrier, against Susanoomon's security placement", async () => {
    const s = setupScenario(fixture, {
      autoSelectCards: true,
      autoAcceptOptional: true,
      declinePrompts: ["Prevent leaving the battle area?"],
      preferTriggerKeys: ["keyword/Raid"],
    });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const defenderId = s.perm("defender").permanentId;
      expect(s.perm("defender").keywords).toContain("Barrier");
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
      expect(
        s.decisions.some(
          ({ req }) => req.sourceCardId === "BT24-101" && req.promptText === "Prevent leaving the battle area?",
        ),
      ).toBe(true);
      expect(s.events.some(({ kind }) => kind === "barrierPrompt")).toBe(false);
      expect(s.state.players[1]!.security[0]!.instanceId).toBe(s.inst("defender").instanceId);
      expect(s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === defenderId)).toBe(false);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("offers inherited Barrier alongside Jupitermon's leave protection for an actual battle loss", async () => {
    const s = setupScenario(
      {
        ...fixture,
        board: { ...fixture.board, 0: { ...fixture.board[0], battleArea: [{ card: "BT12-112", as: "attacker" }] } },
      },
      { autoSelectCards: true, autoDeclineOptional: true, autoOrderTriggers: false },
    );
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some(({ kind }) => kind === "counterWindowOpened"));
      expect(s.engine.applyIntent(1, { type: "respondCounter" })).toEqual({ ok: true });
      await settle(() => observe(s.engine).blockingSeat() === 1);
      expect(
        s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("defender").permanentId }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const request = s.decisions.at(-1)!.req;
      expect(request.options?.triggerCardIds).toEqual(expect.arrayContaining(["BT24-034", "BT24-101"]));
      const barrierIndex = request.options!.triggerDescriptions!.findIndex((description) =>
        description.startsWith("＜Barrier＞"),
      );
      expect(barrierIndex).toBeGreaterThanOrEqual(0);
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "orderTriggers", order: [request.options!.triggerKeys![barrierIndex]!] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some(({ kind }) => kind === "barrierPrompt"));
      expect(
        s.engine.applyIntent(1, { type: "respondBarrier", permanentId: s.perm("defender").permanentId, accept: true }),
      ).toEqual({ ok: true });
      for (let step = 0; step < 10; step++) {
        await settle(
          () =>
            s.state.pendingDecision?.kind === "orderTriggers" ||
            (!observe(s.engine).isAttacking() && s.state.pendingDecision === undefined),
        );
        const pending = s.state.pendingDecision;
        if (pending === undefined) {
          break;
        }
        const next = s.decisions.at(-1)!.req;
        expect(
          s.engine.applyIntent(pending.seat, {
            type: "respondDecision",
            decisionId: pending.decisionId,
            response: { kind: "orderTriggers", order: next.options!.triggerKeys! },
          }),
        ).toEqual({ ok: true });
      }
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(
        s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === s.perm("defender").permanentId),
      ).toBe(true);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
