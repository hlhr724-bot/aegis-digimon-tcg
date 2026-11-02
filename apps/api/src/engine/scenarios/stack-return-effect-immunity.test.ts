import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Stack return effect immunity", () => {
  it("keeps an immune Craniamon's complete evolution stack when Chronomon returns stacked cards", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT26-060", as: "chronomon" }] },
        1: {
          battleArea: [
            { card: "EX13-062", as: "craniamon", under: ["BT1-009", "BT1-015"] },
            { card: "BT1-015", as: "ordinary", under: ["BT1-009"] },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("craniamon"));
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chronomon").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.perm("craniamon").topCard.cardId).toBe("EX13-062");
    expect(s.perm("craniamon").stack.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-015"]);
    expect(s.perm("ordinary").topCard.cardId).toBe("BT1-009");
    expect(s.state.players[1]!.deck.map((card) => card.cardId)).toEqual(["BT1-015"]);
  });
});
