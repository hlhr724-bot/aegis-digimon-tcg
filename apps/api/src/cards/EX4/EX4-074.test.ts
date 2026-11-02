import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX4-074.js";
import "../BT1/BT1-010.js";
import "../index.js";

describe("EX4-074 ShineGreymon: Ruin Mode", () => {
  it("registers its official identity and player-wide -5000 DP effects", () => {
    expect(getCardDefinition("EX4-074")).toMatchObject({
      cardId: "EX4-074",
      nameEn: "ShineGreymon: Ruin Mode",
      colors: ["Purple", "Yellow"],
      level: 7,
      playCost: 14,
      dp: 15000,
      evoCosts: [
        { color: "Purple", level: 6, memoryCost: 5 },
        { color: "Yellow", level: 6, memoryCost: 5 },
      ],
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Light Dragon"],
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving")?.actions?.[0]).toMatchObject({
      kind: "ModifyDP",
      playerWide: true,
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
      amount: -5000,
      duration: "untilOpponentTurnEnd",
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "OnDeletion")?.actions?.[0]).toMatchObject({
      kind: "ModifyDP",
      playerWide: true,
      amount: -5000,
      duration: "untilOpponentTurnEnd",
    });
    expect(compiled.digivolutionRequirement).toEqual([{ namesExact: ["ShineGreymon"], cost: 4, isAlternate: true }]);
  });
  it("at end of attack deletes itself and an opposing Digimon, adds security, and hatches with a Tamer", () => {
    const actions = compiled.effects?.find((entry) => entry.trigger === "EndOfAttack")?.actions;
    expect(actions).toMatchObject([
      {
        kind: "Delete",
        target: { isSelf: true },
        additionalSimultaneousTargets: [{ filter: { controller: "opponent" }, count: 1 }],
      },
      { kind: "SecurityManipulation", op: "placeFromDeck", controller: "mine", amount: 1, toTop: true },
      { kind: "Hatch", condition: { kind: "youHave" } },
    ]);
  });

  it.each([
    ["purple", "AD1-018"],
    ["yellow", "BT1-062"],
  ])("digivolves from a %s level-6 Digimon for 5", async (_color, baseCard) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: baseCard, as: "base" }],
        hand: [{ card: "EX4-074", as: "ruinMode" }],
      },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("ruinMode").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX4-074");

    expect(s.state.memory).toBe(0);
  });

  it("digivolves from ShineGreymon for 4", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "AD1-016", as: "shineGreymon" }],
        hand: [{ card: "EX4-074", as: "ruinMode" }],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("shineGreymon").permanentId,
        instanceId: s.inst("ruinMode").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("shineGreymon").topCard.cardId === "EX4-074");

    expect(s.state.memory).toBe(0);
  });

  it("publicly evolves from ShineGreymon and gives every opposing Digimon -5000 DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "AD1-016", as: "shineGreymon" }],
          hand: [{ card: "EX4-074", as: "ruinMode" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first", dp: 10000 },
            { card: "BT1-010", as: "second", dp: 11000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    const firstBefore = s.perm("first").currentDP;
    const secondBefore = s.perm("second").currentDP;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("shineGreymon").permanentId,
        instanceId: s.inst("ruinMode").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("shineGreymon").topCard?.instanceId === s.inst("ruinMode").instanceId);

    expect(s.state.memory).toBe(0);
    expect(s.perm("shineGreymon").stack.map((card) => card.cardId)).toEqual(["AD1-016"]);
    expect(s.perm("first").currentDP).toBe(firstBefore - 5000);
    expect(s.perm("second").currentDP).toBe(secondBefore - 5000);
  });

  it("applies the When Digivolving debuff to all current opposing Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX4-074", as: "ruin" }] },
      1: {
        battleArea: [
          { card: "BT1-009", as: "first", dp: 10000 },
          { card: "BT1-010", as: "second", dp: 11000 },
        ],
      },
    });
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("ruin"));

    expect(s.perm("first").currentDP).toBe(5000);
    expect(s.perm("second").currentDP).toBe(6000);
  });

  it("Q3523 deletes a later 5000-DP play before its On Play effect can activate", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX4-074", as: "ruin" }] },
        1: {
          hand: [{ card: "BT1-010", as: "agumon" }],
          deck: ["BT1-085", "BT1-009", "BT1-011", "BT1-012", "BT1-013"],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("ruin"));
    s.state.turnSeat = 1;
    s.state.memory = 10;

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("agumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("agumon").instanceId));

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.hand).toHaveLength(0);
    expect(s.state.players[1]!.deck).toHaveLength(5);
  });

  it("feedback #20: a later play that keeps DP above 0 survives and activates its On Play after Ruin Mode leaves", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX4-074", as: "ruin" },
            { card: "BT1-009", as: "monodramon" },
          ],
        },
        1: { hand: [{ card: "BT5-042", as: "knightmon" }], deck: ["BT1-085", "BT1-085", "BT1-085"] },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("ruin"));
    s.state.turnSeat = 1;
    s.state.memory = 10;
    const ruinCard = s.perm("ruin").topCard.instanceId;
    await advance(s.engine).verb.returnToHand([ruinCard]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([ruinCard]);

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("knightmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT5-042"));

    const knightmon = s.state.players[1]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("knightmon").instanceId,
    );
    expect(knightmon?.currentDP).toBe(2000);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-009"]);
  });

  it("Q3524 resolves the mandatory End of Attack sequence, including Recovery and Hatch", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX4-074", as: "ruin" },
            { card: "BT1-085", as: "tamer" },
          ],
          deck: [{ card: "BT1-009", as: "recovery" }],
          eggDeck: [{ card: "BT1-006", as: "egg" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    const ruinId = s.inst("ruin").instanceId;
    const targetId = s.inst("target").instanceId;
    const recoveryId = s.inst("recovery").instanceId;
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnEndAttack, s.perm("ruin"));
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-006");

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === ruinId)).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === targetId)).toBe(true);
    expect(s.state.players[0]!.security[0]?.instanceId).toBe(recoveryId);
    expect(s.state.players[0]!.breeding?.topCard?.cardId).toBe("BT1-006");
  });

  it("resolves Q3524 through a public attack, including both deletions, recovery, and Tamer-gated hatch", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX4-074", as: "ruin" },
            { card: "BT1-085", as: "tamer" },
          ],
          deck: [{ card: "BT1-009", as: "recovery" }],
          eggDeck: [{ card: "BT1-006", as: "egg" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }], security: ["BT1-009", "BT1-010"] },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    await s.ready();
    const ruinId = s.inst("ruin").instanceId;
    const targetId = s.inst("target").instanceId;
    const recoveryId = s.inst("recovery").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ruin").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === ruinId) &&
        s.state.players[1]!.trash.some((card) => card.instanceId === targetId) &&
        s.state.players[0]!.security.some((card) => card.instanceId === recoveryId) &&
        s.state.players[0]!.breeding?.topCard?.instanceId === s.inst("egg").instanceId,
    );

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === ruinId)).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === targetId)).toBe(true);
    expect(s.state.players[0]!.security[0]?.instanceId).toBe(recoveryId);
    expect(s.state.players[0]!.breeding?.topCard?.cardId).toBe("BT1-006");
  });

  it("Q3525 still deletes itself and recovers with no opposing Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX4-074", as: "ruin" }],
        deck: [{ card: "BT1-009", as: "recovery" }],
      },
    });
    const ruinId = s.inst("ruin").instanceId;
    const recoveryId = s.inst("recovery").instanceId;
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnEndAttack, s.perm("ruin"));
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === recoveryId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === ruinId)).toBe(true);
    expect(s.state.players[0]!.security[0]?.instanceId).toBe(recoveryId);
  });

  it("publicly attacks with no opposing Digimon and still deletes itself and recovers (Q3525)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX4-074", as: "ruin" }],
        deck: [{ card: "BT1-009", as: "recovery" }],
      },
      1: { security: ["BT1-009", "BT1-010"] },
    });
    s.state.turnSeat = 0;
    await s.ready();
    const ruinId = s.inst("ruin").instanceId;
    const recoveryId = s.inst("recovery").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ruin").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === ruinId) &&
        s.state.players[0]!.security.some((card) => card.instanceId === recoveryId),
    );

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === ruinId)).toBe(true);
    expect(s.state.players[0]!.security[0]?.instanceId).toBe(recoveryId);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("does not hatch unless its controller has a Tamer in play", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX4-074", as: "ruin" }],
        deck: [{ card: "BT1-009", as: "recovery" }],
        eggDeck: [{ card: "BT1-006", as: "egg" }],
      },
    });
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnEndAttack, s.perm("ruin"));
    await settle(() => s.state.players[0]!.security.some((card) => card.cardId === "BT1-009"));

    expect(s.state.players[0]!.breeding).toBeUndefined();
  });

  it("ends the deletion debuff when the current opponent turn ends", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX4-074", as: "ruin" }], deck: ["BT1-009", "BT1-009", "BT1-009"] },
      1: {
        battleArea: [
          { card: "BT1-009", as: "opponentA", dp: 10000 },
          { card: "BT1-009", as: "opponentB", dp: 11000 },
        ],
        deck: ["BT1-009", "BT1-009", "BT1-009"],
      },
    });
    await s.ready();
    s.state.turnSeat = 1;

    await advance(s.engine).verb.deletePermanent([s.perm("ruin").permanentId]);

    expect(s.perm("opponentA").currentDP).toBe(5000);
    expect(s.perm("opponentB").currentDP).toBe(6000);

    await advance(s.engine).runTurn(1);
    expect(s.perm("opponentA").currentDP).toBe(10000);
    expect(s.perm("opponentB").currentDP).toBe(11000);
  });

  it("keeps the deletion debuff from its owner's turn through the end of the opponent's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX4-074", as: "ruin" }], deck: ["BT1-009", "BT1-009", "BT1-009"] },
      1: {
        battleArea: [{ card: "BT1-009", as: "opponentA", dp: 10000 }],
        deck: ["BT1-009", "BT1-009", "BT1-009"],
      },
    });
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("ruin").permanentId]);
    expect(s.perm("opponentA").currentDP).toBe(5000);

    await advance(s.engine).runTurn(0);
    expect(s.perm("opponentA").currentDP).toBe(5000);

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(1);
    expect(s.perm("opponentA").currentDP).toBe(10000);
  });
});
