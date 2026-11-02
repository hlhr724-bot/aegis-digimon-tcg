import { EffectDuration, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT17-067.js";
import "./index.js";
import "../ST3/ST3-16.js";

describe("BT17-067 DexDoruGreymon", () => {
  it("installs the Trash replacement that digivolves a DoruGreymon before deletion", () => {
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "AllTurns",
      isFromTrash: true,
      actions: [
        {
          kind: "Replacement",
          event: "wouldBeDeleted",
          target: { filter: { nameOrTrait: [{ tokens: ["DoruGreymon"], match: "nameExact" }] } },
          digivolveFromTrash: true,
        },
      ],
    });
  });

  it("keeps the inherited end-of-attack deletion once per turn", () => {
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "EndOfAttack",
      isInherited: true,
      frequency: "OncePerTurn",
      optional: true,
      actions: [
        { kind: "SelectBind", target: { bindAs: "chosenDigimon", upTo: true } },
        { kind: "Delete", target: { fromSelectionRef: "chosenDigimon" } },
        {
          kind: "Delete",
          target: { filter: { relativeTo: { attr: "level", op: "lte", selectionRef: "chosenDigimon" } } },
        },
      ],
    });
  });

  it("replaces only the draw with play-cost deletion when the condition is met", () => {
    expect(compiled.effects?.[1]?.actions?.[0]).toMatchObject({ kind: "Trash" });
    expect(compiled.effects?.[1]?.actions?.[0]).not.toHaveProperty("optional");
    expect(compiled.effects?.[1]?.actions?.[1]).toMatchObject({
      kind: "Draw",
      amount: 1,
      condition: { kind: "not", condition: { kind: "anyOf" } },
    });
    expect(compiled.effects?.[1]?.actions?.[2]).toMatchObject({
      kind: "Delete",
      target: { filter: { playCostLte: 6 } },
      condition: { kind: "anyOf" },
    });
  });

  it("uses the DoruGreymon route, mandates the hand trash, and deletes instead of drawing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-061", as: "doruGreymon" }],
          hand: [
            { card: "BT17-067", as: "dexDoruGreymon" },
            { card: "BT1-009", as: "discarded" },
          ],
          deck: [
            { card: "BT1-010", as: "digivolutionBonus" },
            { card: "BT1-011", as: "notDrawn" },
          ],
        },
        1: { battleArea: [{ card: "BT1-019", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 1;
    const targetId = s.perm("target").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("doruGreymon").permanentId,
        instanceId: s.inst("dexDoruGreymon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetId));

    expect(s.state.memory).toBe(0);
    expect(s.perm("doruGreymon").stack.map((card) => card.cardId)).toEqual(["BT16-061"]);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-009")).toBe(true);
    expect(s.perm("doruGreymon").topCard.cardId).toBe("BT17-067");
  });

  it("refuses a near-name DexDoruGreymon source on the exact [DoruGreymon] route", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT9-078", as: "dexSource" }],
        hand: [{ card: "BT17-067", as: "dexDoruGreymon" }],
      },
    });
    s.state.memory = 1;
    await s.ready();
    const sourceInstanceId = s.perm("dexSource").topCard.instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("dexSource").permanentId,
        instanceId: s.inst("dexDoruGreymon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).not.toEqual({ ok: true });

    expect(s.perm("dexSource").topCard.cardId).toBe("BT9-078");
    expect(s.perm("dexSource").topCard.instanceId).toBe(sourceInstanceId);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT17-067")).toBe(true);
    expect(s.state.memory).toBe(1);
  });

  it("draws instead of deleting when no DoruGreymon underlies it and it did not digivolve from the trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT3-081", as: "purpleLv4" }],
          hand: [
            { card: "BT17-067", as: "dexDoruGreymon" },
            { card: "BT1-009", as: "discarded" },
          ],
          deck: [
            { card: "BT1-010", as: "digivolutionBonus" },
            { card: "BT1-011", as: "whenDigivolvingDraw" },
            { card: "BT1-012", as: "notDrawn" },
          ],
        },
        1: { battleArea: [{ card: "BT1-019", as: "survivor" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;
    const survivorId = s.perm("survivor").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("purpleLv4").permanentId,
        instanceId: s.inst("dexDoruGreymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("purpleLv4").topCard.cardId === "BT17-067");

    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-009")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-010")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-011")).toBe(true);
    expect(s.state.players[0]!.deck.some((card) => card.cardId === "BT1-012")).toBe(true);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === survivorId)).toBe(true);
  });

  it("matches the catalog printed text, requirement, and coverage", () => {
    expect(getCardDefinition("BT17-067")).toMatchObject({
      cardId: "BT17-067",
      nameEn: "DexDoruGreymon",
      colors: ["Purple", "Black"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 8,
      dp: 8000,
      evoCosts: [
        { color: "Purple", level: 4, memoryCost: 4 },
        { color: "Black", level: 4, memoryCost: 4 },
      ],
    });
    const printed = getCardDefinition("BT17-067")!.effectText!;
    expect(printed).toContain("[Digivolve][DoruGreymon]: Cost 1");
    expect(printed).toContain(
      "[When Digivolving] Trash 1 card in your hand. Then, ＜Draw 1＞. If [DoruGreymon] is in this Digimon's digivolution cards or this digivolved from the trash, delete 1 of your opponent's Digimon with a play cost of 6 or less instead.",
    );
    expect(getCardDefinition("BT17-067")!.inheritedEffectText).toContain(
      "with alevel equal to or lower than that Digimon",
    );
    expect(compiled.digivolutionRequirement).toEqual([{ namesExact: ["DoruGreymon"], cost: 1, isAlternate: true }]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("spares a chosen protected Digimon yet still deletes the opponent, once per turn (Q2825)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT17-071", under: ["BT17-067"], as: "host" }] },
        1: {
          battleArea: [
            { card: "BT17-070", as: "levelSixA" },
            { card: "BT1-014", as: "levelFour" },
            { card: "BT17-077", as: "levelSeven" },
          ],
          security: [{ card: "BT1-009" }, { card: "BT1-010" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;
    await advance(s.engine).verb.restrict(hostId, "beDeleted", EffectDuration.Permanent);

    const eligibleTargets = () =>
      s.state.players[1]!.battleArea.filter((permanent) => ["BT17-070", "BT1-014"].includes(permanent.topCard.cardId))
        .length;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: hostId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => eligibleTargets() === 1);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === hostId)).toBe(true);
    expect(eligibleTargets()).toBe(1);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT17-077")).toBe(true);

    await advance(s.engine).verb.unsuspend([hostId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: hostId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await drainMicrotasks();

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === hostId)).toBe(true);
    expect(eligibleTargets()).toBe(1);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT17-077")).toBe(true);
  });

  it("naturally replaces an effect deletion from the trash and resolves the trash digivolution effects", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-061", as: "doruGreymon" }],
          trash: [{ card: "BT17-067", as: "dexDoruGreymon" }],
          hand: [{ card: "BT1-009", as: "discarded" }],
          deck: [
            { card: "BT1-010", as: "digivolutionBonus" },
            { card: "BT1-011", as: "notDrawn" },
          ],
        },
        1: { battleArea: [{ card: "BT1-019", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const doruId = s.perm("doruGreymon").permanentId;
    const targetId = s.perm("target").permanentId;

    expect(await advance(s.engine).verb.deletePermanent([doruId], "byEffect")).toBe(0);
    await settle(() => s.perm("doruGreymon").topCard.cardId === "BT17-067");

    expect(s.perm("doruGreymon").topCard.cardId).toBe("BT17-067");
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT17-067")).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-009")).toBe(true);
    expect(s.state.players[0]!.deck.some((card) => card.cardId === "BT1-011")).toBe(true);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetId)).toBe(false);
  });

  it("Q2822/Q2823: carries a DP-zero deletion through the trash digivolution and never activates When Digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-061", as: "doruGreymon", dp: 10000 }],
          trash: [{ card: "BT17-067", as: "dexDoruGreymon" }],
          hand: [{ card: "BT1-009", as: "discarded" }],
        },
        1: {
          hand: [{ card: "ST3-16", as: "sevenHeavens" }],
          battleArea: [{ card: "ST3-10", as: "opponentTarget", dp: 10000 }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 8;

    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("sevenHeavens").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 0);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT17-067")).toBe(true);
    expect(s.events).toContainEqual(
      expect.objectContaining({
        kind: "cardsMoved",
        instanceIds: expect.arrayContaining([s.inst("dexDoruGreymon").instanceId]),
        from: "trash",
        fromSeat: 0,
        to: "battleArea",
      }),
    );
    expect(
      s.events.some(
        (event) =>
          event.kind === "effectResolved" && event.sourceCardId === "BT17-067" && event.timing === "WhenDigivolving",
      ),
    ).toBe(false);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT16-061")).toBe(true);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT1-009"]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("allows declining the trash replacement, so the originating deletion proceeds", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-061", as: "doruGreymon" }],
          trash: [{ card: "BT17-067", as: "dexDoruGreymon" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const doruId = s.perm("doruGreymon").permanentId;

    expect(await advance(s.engine).verb.deletePermanent([doruId], "byEffect")).toBe(1);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT17-067")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT16-061")).toBe(true);
  });

  it("runs the inherited end-of-attack choice from a natural attack", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT17-071", under: ["BT17-067"], as: "host" }] },
        1: {
          battleArea: [
            { card: "BT17-070", as: "levelSix" },
            { card: "BT17-077", as: "levelSeven" },
          ],
          security: [{ card: "BT1-009" }, { card: "BT1-010" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT17-070")).toBe(false);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT17-077")).toBe(true);
  });
});

describe("BT17-067 DexDoruGreymon — KB Q&A rulings", () => {
  async function deleteByEffect(board: { battleArea: string; dexZone: "trash" | "hand" }) {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: board.battleArea, as: "victim" }],
          hand: board.dexZone === "hand" ? ["BT17-067"] : [],
          trash: board.dexZone === "trash" ? ["BT17-067"] : [],
          deck: ["BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const deleted = await advance(s.engine).verb.deletePermanent([s.perm("victim").permanentId], "byEffect");
    await settle();
    return { s, deleted };
  }

  it("triggers only from the trash, when one of your [DoruGreymon] would be deleted (Q2821)", async () => {
    const fromTrash = await deleteByEffect({ battleArea: "BT16-061", dexZone: "trash" });
    expect(fromTrash.deleted).toBe(0);
    expect(fromTrash.s.perm("victim").topCard.cardId).toBe("BT17-067");
    expect(fromTrash.s.state.players[0]!.trash.some((card) => card.cardId === "BT17-067")).toBe(false);

    const fromHand = await deleteByEffect({ battleArea: "BT16-061", dexZone: "hand" });
    expect(fromHand.deleted).toBe(1);
    expect(fromHand.s.state.players[0]!.battleArea).toHaveLength(0);
    expect(fromHand.s.state.players[0]!.hand.some((card) => card.cardId === "BT17-067")).toBe(true);

    const notDoruGreymon = await deleteByEffect({ battleArea: "BT3-081", dexZone: "trash" });
    expect(notDoruGreymon.deleted).toBe(1);
    expect(notDoruGreymon.s.state.players[0]!.battleArea).toHaveLength(0);
    expect(notDoruGreymon.s.state.players[0]!.trash.some((card) => card.cardId === "BT17-067")).toBe(true);
  });

  it("still trashes a hand card and deletes instead of only the <Draw 1> (Q2824)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-061", as: "doruGreymon" }],
          hand: [
            { card: "BT17-067", as: "dexDoruGreymon" },
            { card: "BT1-009", as: "discarded" },
          ],
          deck: [
            { card: "BT1-010", as: "digivolutionBonus" },
            { card: "BT1-011", as: "notDrawn" },
          ],
        },
        1: { battleArea: [{ card: "BT1-019", as: "costSix" }] },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("discarded").instanceId);
    s.state.memory = 1;
    const discardedId = s.inst("discarded").instanceId;
    const costSixId = s.perm("costSix").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("doruGreymon").permanentId,
        instanceId: s.inst("dexDoruGreymon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === costSixId));
    await settle();

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([discardedId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("digivolutionBonus").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("notDrawn").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });
});

describe("BT17-067 DexDoruGreymon — Discord bug 1557128872544313456 (exact [DoruGreymon])", () => {
  it.each(["BT17-067", "BT9-078"])(
    "does not offer the [Trash] replacement when DexDoruGreymon %s would be deleted",
    async (nearNameCardId) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: nearNameCardId, as: "nearName" }],
            trash: [{ card: "BT17-067", as: "dexDoruGreymon" }],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      await s.ready();

      expect(await advance(s.engine).verb.deletePermanent([s.perm("nearName").permanentId], "byEffect")).toBe(1);
      await settle();

      expect(s.decisions.filter(({ req }) => req.kind === "optional")).toEqual([]);
      expect(s.state.players[0]!.battleArea).toHaveLength(0);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("dexDoruGreymon").instanceId)).toBe(
        true,
      );
    },
  );

  it("draws instead of deleting when only a DexDoruGreymon is in its digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT3-081", under: ["BT9-078"], as: "purpleLv4" }],
          hand: [
            { card: "BT17-067", as: "dexDoruGreymon" },
            { card: "BT1-009", as: "discarded" },
          ],
          deck: [
            { card: "BT1-010", as: "digivolutionBonus" },
            { card: "BT1-011", as: "whenDigivolvingDraw" },
          ],
        },
        1: { battleArea: [{ card: "BT1-019", as: "survivor" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    const survivorId = s.perm("survivor").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("purpleLv4").permanentId,
        instanceId: s.inst("dexDoruGreymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("discarded").instanceId));
    await settle();

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.perm("purpleLv4").topCard.cardId).toBe("BT17-067");
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("whenDigivolvingDraw").instanceId)).toBe(
      true,
    );
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === survivorId)).toBe(true);
  });
});
