import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "EX11-050";

describe("EX11-050 Loudmon", () => {
  it("preserves the printed card, trait evolution, hand cost, DP comparison, and conditional keywords", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Loudmon",
      colors: ["Purple", "Red"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [
        { color: "Purple", level: 4, memoryCost: 4 },
        { color: "Red", level: 4, memoryCost: 4 },
      ],
      types: ["Cyborg", "LIBERATOR", "Dark Dragon"],
    });
    const compiled = runtimeCompiledCard(cardId)!;
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 4, traits: ["Dark Dragon", "Evil Dragon"], cost: 3, isAlternate: true },
    ]);
    expect(digivolutionRequirementsFor(cardId)).toEqual(compiled.digivolutionRequirement);
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      expect(compiled.effects.find((candidate) => candidate.trigger === trigger)?.actions).toMatchObject([
        { kind: "Trash", target: { filter: { zone: "hand" }, count: 2 } },
        {
          kind: "SelectBind",
          target: {
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["Dark Dragon", "Evil Dragon"], match: "trait" }] },
            bindAs: "dragonDpReference",
          },
        },
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              relativeTo: { attr: "dp", op: "lte", selectionRef: "dragonDpReference" },
            },
          },
        },
      ]);
    }
  });

  it.each([
    ["Dark Dragon", "EX11-049"],
    ["Evil Dragon", "BT11-079"],
  ] as const)("digivolves through the public %s level-4 peer route", async (_label, baseCard) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: baseCard, as: "base" }],
          hand: [
            { card: cardId, as: "evolving" },
            { card: "BT1-009", as: "discard1" },
            { card: "BT1-010", as: "discard2" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId);
    expect(s.perm("base").stack.map(({ cardId: id }) => id)).toEqual([baseCard]);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash).toHaveLength(2);
    assertNoLoudGap(s);
  });

  it("rejects a same-level Dark Dragon source for the level-4 alternate requirement", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT20-075", as: "base" }],
        hand: [{ card: cardId, as: "evolving" }],
      },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("base").topCard.cardId).toBe("BT20-075");
    expect(s.state.memory).toBe(3);
    assertNoLoudGap(s);
  });

  it("trashes 2 cards and deletes an opponent no stronger than an own Dark Dragon", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "source" }, "BT1-009", "BT1-010", "BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "eligible", dp: 7000 },
            { card: "AD1-011", as: "tooLarge", dp: 8000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.length === 2);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.trash).toHaveLength(2);
    expect(s.state.players[1]!.battleArea.map((card) => card.permanentId)).toEqual([s.perm("tooLarge").permanentId]);
    assertNoLoudGap(s);
  });

  it("grants Scapegoat only to own Dark/Evil Dragons while hand size is at most 4", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: cardId, as: "source" },
          { card: "EX11-049", as: "dragon" },
          { card: "BT1-009", as: "plain" },
        ],
        hand: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
      },
    });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("source"), "Scapegoat")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("dragon"), "Scapegoat")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("plain"), "Scapegoat")).toBe(false);
    assertNoLoudGap(s);
  });

  it("withholds both auras at 5 cards in hand and restores them at 4", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: cardId, as: "source" },
          { card: "EX11-049", as: "inheritedHost", under: [cardId] },
        ],
        hand: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
      },
    });
    await s.ready();
    expect(s.state.players[0]!.hand).toHaveLength(5);
    expect(observe(s.engine).hasKeyword(s.perm("source"), "Scapegoat")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("inheritedHost"), "Scapegoat")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("inheritedHost"), "SecurityAttack")).toBe(false);

    s.state.players[0]!.hand.splice(0, 1);
    await s.ready();

    expect(s.state.players[0]!.hand).toHaveLength(4);
    expect(observe(s.engine).hasKeyword(s.perm("source"), "Scapegoat")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("inheritedHost"), "Scapegoat")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("inheritedHost"), "SecurityAttack")).toBe(true);
    assertNoLoudGap(s);
  });

  it("gives own Dark/Evil Dragons Security Attack +1 from an inherited source on your turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX11-049", as: "host", under: [cardId] },
          { card: "BT1-009", as: "plain" },
        ],
      },
    });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "SecurityAttack")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("plain"), "SecurityAttack")).toBe(false);
    s.state.turnSeat = 1;
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "SecurityAttack")).toBe(false);
    assertNoLoudGap(s);
  });
});
