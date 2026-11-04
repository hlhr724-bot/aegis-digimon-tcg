import { describe, expect, it } from "vitest";
import { Zone } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/paid-hand-play-can-be-declined.fixture";
import "#api/cards/index";

describe("paid hand play can be declined", () => {
  it.each([
    { mixed: false, tamerPayment: false },
    { mixed: true, tamerPayment: false },
    { mixed: false, tamerPayment: true },
    { mixed: true, tamerPayment: true },
  ])(
    "keeps payment and OPT use after passing (mixed: $mixed, Tamer payment: $tamerPayment)",
    async ({ mixed, tamerPayment }) => {
      const s = setupScenario(fixture, {
        autoAcceptOptional: true,
        autoChooseOption: true,
        preferOptionIndex: tamerPayment ? 1 : 0,
      });
      if (mixed) {
        s.give(0, Zone.Hand, { card: "ST23-02", as: "playableDigimon" });
        s.give(0, Zone.Hand, { card: "ST23-15", as: "usableOption" });
      }
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("murasamemon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const decision = s.decisions.at(-1)!.req;
      expect(s.state.players[0]!.security).toHaveLength(tamerPayment ? 1 : 0);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("securityCost").instanceId)).toBe(
        !tamerPayment,
      );
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("tamerCost").instanceId)).toBe(
        tamerPayment,
      );
      expect(decision.options).toMatchObject({ min: 0, max: 1 });
      expect(decision.options?.candidateInstanceIds).toContain(s.inst("playableTamer").instanceId);
      expect(decision.options?.candidateInstanceIds).not.toContain(s.inst("wrongTrait").instanceId);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined);
      expect(s.state.memory).toBe(5);
      expect(s.state.players[0]!.battleArea).toHaveLength(2);
      expect(s.perm("base").topCard.cardId).toBe("BT25-041");
      expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-051"]);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("playableTamer").instanceId);
      const decisionsBeforeAttack = s.decisions.length;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("base").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
      expect(s.decisions.slice(decisionsBeforeAttack).filter(({ req }) => req.sourceCardId === "BT25-041")).toEqual([]);
      expect(s.perm("tamer").stack.some((card) => card.instanceId === s.inst("tamerCost").instanceId)).toBe(
        !tamerPayment,
      );
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(s.state.turnSeat).toBe(1);
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
});
