import { describe, expect, it } from "vitest";
import "#api/cards/BT23/BT23-013";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("Jesmon evolves from Huckmon only with a qualifying opposing Digimon", () => {
  it.each([9000, 10000, 11000])("checks the opponent's current %s DP", async (dp) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-009", as: "huckmon" }],
          hand: [{ card: "BT23-013", as: "jesmon" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "EX11-042", as: "opponent", dp }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    const qualifies = dp >= 10000;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("huckmon").permanentId,
        instanceId: s.inst("jesmon").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(qualifies);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("huckmon").topCard.cardId).toBe(qualifies ? "BT23-013" : "EX13-009");
    expect(s.state.memory).toBe(qualifies ? 0 : 5);
  });
});
