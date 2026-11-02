import { describe, expect, it } from "vitest";
import "#api/cards/BT20/BT20-010";
import "#api/cards/EX13/EX13-049";
import "#api/cards/EX13/EX13-055";
import "#api/cards/EX5/EX5-070";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("Proto Form combines with a Digimon's evolution reduction", () => {
  it.each([
    { ryudamon: false, alternate: false },
    { ryudamon: true, alternate: false },
    { ryudamon: false, alternate: true },
    { ryudamon: true, alternate: true },
  ])(
    "stacks discounts on the declared route (ryudamon=$ryudamon, alternate=$alternate)",
    async ({ ryudamon, alternate }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: ryudamon ? "BT20-010" : "EX13-049", as: "base" }],
            hand: [
              { card: "EX5-070", as: "proto" },
              { card: "EX13-055", as: "evolution" },
            ],
            deck: ["BT1-009"],
          },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          autoChooseOption: true,
          preferOptionIndex: alternate ? 1 : 0,
        },
      );
      s.state.memory = 5;
      const baseId = s.inst("base").instanceId;
      const protoId = s.inst("proto").instanceId;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: protoId })).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "EX5-070") &&
          s.state.pendingDecision === undefined,
      );
      expect(s.perm("base").topCard.cardId).toBe("EX13-055");
      expect(s.perm("base").stack.map((c) => c.instanceId)).toEqual([protoId, baseId]);
      const baseCost = alternate ? 2 : 3;
      expect(s.state.memory).toBe(5 - baseCost + 1 + Number(ryudamon));
      expect(s.state.players[0]!.trash.some((c) => c.instanceId === protoId)).toBe(false);
    },
  );
});
