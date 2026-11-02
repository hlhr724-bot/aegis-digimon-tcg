import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Blast DNA hand material", () => {
  it.each([false, true])(
    "requires a hand partner when the named field Digimon is attacked: %s",
    async (partnerInHand) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT1-024", as: "attacker", dp: 14000 }] },
          1: {
            battleArea: [
              { card: "EX13-060", as: "alphamon", suspended: true },
              ...(!partnerInHand ? [{ card: "BT20-018", as: "ouryumon" }] : []),
            ],
            hand: [{ card: "BT20-060", as: "ace" }, ...(partnerInHand ? [{ card: "BT20-018", as: "ouryumon" }] : [])],
            deck: ["BT1-009", "BT1-009"],
          },
        },
        { autoSelectCards: true, autoDeclineOptional: true },
      );
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "permanent", permanentId: s.perm("alphamon").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(() =>
        s.events.some((event) => event.kind === "counterWindowOpened" || event.kind === "attackEnded"),
      );
      const counter = s.events.find((event) => event.kind === "counterWindowOpened");
      expect(counter !== undefined).toBe(partnerInHand);
      if (counter?.kind === "counterWindowOpened") {
        const choice = counter.eligibleCounters[0]!;
        expect(counter.eligibleCounters).toHaveLength(1);
        expect(choice.instanceId).toBe(s.inst("ace").instanceId);
        expect(
          s.engine.applyIntent(1, {
            type: "respondCounter",
            sourceInstanceId: choice.instanceId,
            effectKey: choice.effectKey,
          }),
        ).toEqual({ ok: true });
      }
      await settle(
        () => s.events.some((event) => event.kind === "attackEnded") && s.state.pendingDecision === undefined,
      );
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
        partnerInHand ? ["BT20-060"] : ["BT20-018"],
      );
      expect(s.state.players[1]!.hand.map((card) => card.cardId)).toEqual(partnerInHand ? ["BT1-009"] : ["BT20-060"]);
    },
  );
});
