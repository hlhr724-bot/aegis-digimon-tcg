import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine } from "../../engine/testkit/harness.js";
import "./BT9-102.js";

describe("BT9-102 Attack of the Heavy Mobile Digimon! — Security", () => {
  it("may trash a Machine or Cyborg to delete an opponent no more expensive than it", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "BT9-102", as: "option", faceUp: true }], hand: [{ card: "BT9-029", as: "cost" }] },
        1: { battleArea: [{ card: "BT1-028", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("does not delete an opponent Digimon whose play cost exceeds the trashed card", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT9-102", as: "option", faceUp: true }],
          hand: [{ card: "BT9-046", as: "cost" }],
        },
        1: { battleArea: [{ card: "BT1-019", as: "tooExpensive" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("tooExpensive").topCard.cardId).toBe("BT1-019");
  });
});
