import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("De-Digivolve protected recipient", () => {
  it.each(["protected", "ordinary"])(
    "preserves Wisemon immunity while Minervamon chooses the %s stack",
    async (recipient) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: { hand: [{ card: "BT24-041", as: "minervamon" }] },
          1: {
            battleArea: [
              { card: "EX13-034", as: "protected", under: ["BT1-009", "BT1-015"] },
              { card: "BT1-015", as: "ordinary", under: ["BT1-009"] },
            ],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      s.state.memory = 10;
      await s.ready();
      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("protected"));
      preferred.push(s.perm(recipient).permanentId);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("minervamon").instanceId })).toEqual({
        ok: true,
      });
      await settle();
      expect(s.perm("protected").topCard.cardId).toBe("EX13-034");
      expect(s.perm("protected").stack.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-015"]);
      expect(s.perm("ordinary").topCard.cardId).toBe(recipient === "ordinary" ? "BT1-009" : "BT1-015");
      expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(recipient === "ordinary" ? ["BT1-015"] : []);
    },
  );
});
