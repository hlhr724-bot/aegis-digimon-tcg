import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import "#api/cards/index";
import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

const securityCases = [
  { option: "BT12-108", payment: "BT1-042" },
  { option: "BT13-109", payment: "BT1-009" },
  { option: "BT9-102", payment: "BT1-042" },
];

describe("a Delete bound to its paid card still offers the cost without a target", () => {
  it.each(securityCases.flatMap((entry) => [true, false].map((accept) => ({ ...entry, accept }))))(
    "$option Security trashes $payment with no opposing Digimon when accept=$accept",
    async ({ option, payment, accept }) => {
      const s = setupEngine(
        {
          0: {
            security: [{ card: option, as: "option", faceUp: true }],
            hand: [{ card: payment, as: "payment" }],
          },
          1: { battleArea: [] },
        },
        accept ? { autoAcceptOptional: true, autoSelectCards: true } : { autoDeclineOptional: true },
      );
      await s.ready();
      await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
      const paymentId = s.inst("payment").instanceId;
      expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === paymentId)).toBe(!accept);
      expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === paymentId)).toBe(accept);
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it.each([true, false])(
    "Ravemon: Burst Mode returns a trash Digimon with no same-name opposing Digimon when accept=%s",
    async (accept) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT13-092", as: "ravemon" }] },
          1: {
            battleArea: [{ card: "BT1-020", as: "differentName" }],
            trash: [{ card: "BT1-009", as: "returned" }],
          },
        },
        accept ? { autoAcceptOptional: true, autoSelectCards: true } : { autoDeclineOptional: true },
      );
      await s.ready();
      await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("ravemon"), {
        attackerPermanentId: s.perm("ravemon").permanentId,
      });
      const returnedId = s.inst("returned").instanceId;
      expect(s.state.players[1]!.trash.some(({ instanceId }) => instanceId === returnedId)).toBe(!accept);
      expect(s.state.players[1]!.deck.at(-1)?.instanceId === returnedId).toBe(accept);
      expect(s.perm("differentName").topCard.cardId).toBe("BT1-020");
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
});
