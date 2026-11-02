import { getCardDefinition, getCompiledCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT2-097.js";

describe("BT2-097 Lightning Paw", () => {
  it("publishes the errata contract as full compiled IR", () => {
    expect(compiled).toMatchObject(getCompiledCard("BT2-097")!);
    expect(getCardDefinition("BT2-097")).toMatchObject({
      nameEn: "Lightning Paw",
      colors: ["Yellow"],
      playCost: 3,
      imageId: "BT2-097-Errata",
      effectText: expect.stringContaining("3 of your opponent's level 3 Digimon"),
      securityEffectText: "[Security] Activate this card's [Main] effect.",
    });
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { controller: "opponent", kind: ["Digimon"], levels: [3] }, count: 3 },
              amount: -4000,
              duration: "forTheTurn",
            },
          ],
        },
        { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
      ],
    });
  });

  it("[Main] affects exactly 3 opponent level-3 Digimon and ignores other levels", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-048", as: "yellowSource" }],
          hand: [{ card: "BT2-097", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first", dp: 4000 },
            { card: "BT1-009", as: "second", dp: 4000 },
            { card: "BT1-009", as: "third", dp: 4000 },
            { card: "BT1-009", as: "fourth", dp: 4000 },
            { card: "BT2-071", as: "levelFour", dp: 5000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 2);

    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-009", "BT2-071"]);
    expect(s.state.players[1]!.trash.filter(({ cardId }) => cardId === "BT1-009")).toHaveLength(3);
  });

  it("[Main] affects all eligible Digimon when fewer than 3 exist", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-048", as: "yellowSource" }],
          hand: [{ card: "BT2-097", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first", dp: 4000 },
            { card: "BT1-009", as: "second", dp: 4000 },
            { card: "BT2-071", as: "levelFour", dp: 5000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.battleArea[0]!.topCard.cardId).toBe("BT2-071");
    expect(s.state.players[1]!.trash.filter(({ cardId }) => cardId === "BT1-009")).toHaveLength(2);
  });

  it("[Security] activates the same [Main] effect", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT2-097", as: "option" }] },
      1: {
        battleArea: [
          { card: "BT1-009", as: "first", dp: 4000 },
          { card: "BT1-009", as: "second", dp: 4000 },
        ],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 0;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("first").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.filter(({ cardId }) => cardId === "BT1-009")).toHaveLength(2);
  });
});
