import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("Examon's two Decode effects", () => {
  it.each([
    { gene: false, firstColor: "Green" },
    { gene: false, firstColor: "Blue" },
    { gene: true, firstColor: "Green" },
    { gene: true, firstColor: "Blue" },
  ])("resolves $firstColor Decode first with Dragon Gene=$gene", async ({ gene, firstColor }) => {
    const s = setupEngine(
      {
        0: { battleArea: ["ST2-02"], hand: [{ card: "ST2-16", as: "bounce" }] },
        1: {
          battleArea: [
            { card: "BT27-034", as: "examon", under: ["EX13-041", "EX13-021"] },
            ...(gene ? [{ card: "BT20-093", as: "gene", placedByEffect: true, enterFieldTurnCount: -1 }] : []),
          ],
          hand: gene ? ["EX3-074"] : [],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, autoOrderTriggers: false, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bounce").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const initialOptions = s.decisions.at(-1)!.req.options!;
    const decodeDescriptions = initialOptions.triggerDescriptions!.filter(
      (_text, index) => initialOptions.triggerCardIds![index] === "BT27-034",
    );
    expect(decodeDescriptions).toHaveLength(2);
    expect(decodeDescriptions[0]).toMatch(/^＜Decode \(Green Lv\.5\)＞/);
    expect(decodeDescriptions[0]).not.toContain("Decode (Blue");
    expect(decodeDescriptions[1]).toMatch(/^＜Decode \(Blue Lv\.5\)＞/);
    expect(decodeDescriptions[1]).not.toContain("Decode (Green");
    for (let step = 0; step < 12; step += 1) {
      await settle();
      if (
        s.state.players[0]!.trash.some(({ cardId }) => cardId === "ST2-16") &&
        s.state.pendingDecision === undefined
      ) {
        break;
      }
      expect(s.state.pendingDecision?.kind).toBe("orderTriggers");
      const options = s.decisions.at(-1)!.req.options!;
      const preferred = options.triggerDescriptions?.findIndex((text) => text.includes(`Decode (${firstColor}`)) ?? -1;
      const key = options.triggerKeys![preferred >= 0 ? preferred : 0]!;
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "orderTriggers", order: [key] },
        }),
      ).toEqual({ ok: true });
    }
    await settle(
      () =>
        s.state.players[0]!.trash.some(({ cardId }) => cardId === "ST2-16") && s.state.pendingDecision === undefined,
    );
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(
      gene ? ["EX3-074"] : ["EX13-021", "EX13-041"],
    );
    expect(s.state.players[1]!.hand.map(({ cardId }) => cardId)).toEqual(["BT27-034"]);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(gene ? ["BT20-093"] : []);
  });
});
