import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("highest DP deletion counts a Digi-Egg on the field as a Digimon", () => {
  it("chooses the unaffected Mother D-Reaper as the highest DP Digimon and deletes nothing else", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-076", as: "crowmon" }],
          hand: [{ card: "BT26-082", as: "ravemon" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "EX2-007", as: "motherDReaper" },
            { card: "BT1-020", as: "groundramon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("crowmon").permanentId,
        instanceId: s.inst("ravemon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0 && s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX2-007", "BT1-020"]);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(7);
  });

  it("deletes the highest DP Digimon when the Digi-Egg on the field has less DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-076", as: "crowmon" }],
          hand: [{ card: "BT26-082", as: "ravemon" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "EX2-007", as: "motherDReaper" },
            { card: "BT27-103", as: "alphamonOuryuken" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("crowmon").permanentId,
        instanceId: s.inst("ravemon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0 && s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX2-007"]);
  });
});
