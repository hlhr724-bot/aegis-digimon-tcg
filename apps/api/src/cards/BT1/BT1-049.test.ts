import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-049.js";
import "./BT1-054.js";
import "./BT1-052.js";
import "../BT2/BT2-041.js";
import "../BT4/BT4-106.js";

describe("BT1-049 Labramon", () => {
  it("matches the catalog and exact inherited deletion watcher IR contract", () => {
    expect(getCardDefinition("BT1-049")).toMatchObject({
      cardId: "BT1-049",
      set: "BT1",
      nameEn: "Labramon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [{ color: "Yellow", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Vaccine"],
      types: ["Beast"],
      inheritedEffectText:
        "[Your Turn] When an opponent's Digimon is deleted by dropping to 0 DP, trigger ＜Draw 1＞ (Draw 1 card from your deck).",
      rarity: "U",
      maxCountInDeck: 4,
      imageId: "BT1-049",
      nameJp: "ラブラモン",
    });
    expect(getCardDefinition("BT1-049")?.effectText).toBeUndefined();
    expect(getCardDefinition("BT1-049")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "YourTurn",
          isInherited: true,
          actions: [
            {
              kind: "SubTrigger",
              event: "onDeletionOf",
              sourceFilter: { controller: "opponent", kind: ["Digimon"] },
              fireCondition: {
                kind: "allOf",
                conditions: [{ kind: "triggerDeletedByDpZero" }, { kind: "triggerIsFirstDeletedPermanent" }],
              },
              actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("draws 1 when an opposing Digimon is deleted by having its DP reduced to 0", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-052", as: "host", under: ["BT1-049"] },
            { card: "BT1-054", as: "attacker" },
          ],
          deck: [{ card: "BT1-010", as: "drawn" }],
        },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 2000 }], security: ["BT1-011"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.players[0]!.hand.length === 1);
    expect(s.state.players[0]!.hand[0]!.instanceId).toBe(s.inst("drawn").instanceId);
  });

  it("carries the inherited watcher through a legal yellow level-2 evolution", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT1-006", as: "base" },
          { card: "BT1-054", as: "reducer" },
        ],
        hand: [
          { card: "BT1-049", as: "labramon" },
          { card: "BT1-052", as: "seasarmon" },
        ],
        deck: [
          { card: "BT1-010", as: "evolutionDrawOne" },
          { card: "BT1-011", as: "evolutionDrawTwo" },
          { card: "BT1-012", as: "triggerDraw" },
        ],
      },
      1: { battleArea: [{ card: "BT1-016", as: "target", dp: 2000 }], security: ["BT1-012"] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("labramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("labramon").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("evolutionDrawOne").instanceId, s.inst("seasarmon").instanceId]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-006"]);

    s.state.memory = 2;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("seasarmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("seasarmon").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("evolutionDrawOne").instanceId, s.inst("evolutionDrawTwo").instanceId]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-006", "BT1-049"]);

    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("reducer").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("evolutionDrawOne").instanceId,
        s.inst("evolutionDrawTwo").instanceId,
        s.inst("triggerDraw").instanceId,
      ]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(3);
  });

  it("rejects evolution from a red level 2 despite matching the level", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-001", as: "redBase" }], hand: [{ card: "BT1-049", as: "labramon" }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("labramon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("does not draw when an opposing Digimon is deleted by an effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "host", under: ["BT1-049"] }],
        deck: [{ card: "BT1-010", as: "notDrawn" }],
      },
      1: { battleArea: [{ card: "BT1-016", as: "target" }] },
    });
    await s.engine.recomputeContinuousEffects();

    await advance(s.engine).verb.deletePermanent([s.perm("target").permanentId], "byEffect");

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("notDrawn").instanceId);
  });

  it("draws only once when two opposing Digimon are simultaneously deleted at 0 DP", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "host", under: ["BT1-049"] }],
        deck: [
          { card: "BT1-010", as: "drawn" },
          { card: "BT1-011", as: "notDrawn" },
        ],
      },
      1: {
        battleArea: [
          { card: "BT1-016", as: "targetA", dp: 0 },
          { card: "BT1-017", as: "targetB", dp: 0 },
        ],
      },
    });
    await s.engine.recomputeContinuousEffects();

    await advance(s.engine).verb.deletePermanent(
      [s.perm("targetA").permanentId, s.perm("targetB").permanentId],
      "byRule",
    );

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("notDrawn").instanceId);
  });

  it("does not draw when the DP-zero deletion happens during the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "host", under: ["BT1-049"] }],
        deck: [{ card: "BT1-010", as: "notDrawn" }],
      },
      1: { battleArea: [{ card: "BT1-016", as: "target", dp: 0 }] },
    });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();

    await advance(s.engine).verb.deletePermanent([s.perm("target").permanentId], "byRule");

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("notDrawn").instanceId);
  });
});

describe("BT1-049 Labramon — KB Q&A rulings", () => {
  it("draws only 1 when two opposing Digimon drop to 0 DP and are deleted together (Q909)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-052", as: "host", under: ["BT1-049"] }],
          hand: [{ card: "BT4-106", as: "purgeShine" }],
          deck: [
            { card: "BT1-010", as: "drawn" },
            { card: "BT1-011", as: "notDrawn" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-016", as: "targetA", dp: 3000 },
            { card: "BT1-016", as: "targetB", dp: 3000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("purgeShine").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await drainMicrotasks();

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["BT1-016", "BT1-016"]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("notDrawn").instanceId]);
  });

  it("draws only 1 when ShineGreymon's When Digivolving deletes several opposing Digimon (Q910)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT2-038", as: "base" },
          { card: "BT1-052", as: "host", under: ["BT1-049"] },
          "BT1-087",
          "BT2-087",
        ],
        hand: [{ card: "BT2-041", as: "shineGreymon" }],
        deck: [
          { card: "BT1-010", as: "evolutionDraw" },
          { card: "BT1-011", as: "labramonDraw" },
          { card: "BT1-012", as: "notDrawn" },
        ],
      },
      1: {
        battleArea: [
          { card: "BT1-016", as: "firstTarget", dp: 4000 },
          { card: "BT1-016", as: "secondTarget", dp: 4000 },
        ],
      },
    });
    s.state.memory = 4;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("shineGreymon").instanceId,
      }),
    ).toEqual({ ok: true });
    for (const target of ["firstTarget", "secondTarget"]) {
      const previousDecisionId = s.decisions.at(-1)?.req.decisionId;
      await settle(
        () =>
          s.state.pendingDecision?.kind === "chooseTargets" &&
          s.state.pendingDecision.decisionId !== previousDecisionId,
      );
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm(target).permanentId] },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await drainMicrotasks();

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["BT1-016", "BT1-016"]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("evolutionDraw").instanceId, s.inst("labramonDraw").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("notDrawn").instanceId]);
  });
});
