import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT17-065.js";
import "./index.js";
import "../ST3/ST3-16.js";

describe("BT17-065 DexDorugamon", () => {
  it("matches the catalog printed text, requirement and coverage", () => {
    expect(getCardDefinition("BT17-065")).toMatchObject({
      cardId: "BT17-065",
      nameEn: "DexDorugamon",
      colors: ["Purple", "Black"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 6,
      dp: 6000,
      inheritedEffectText: "＜Reboot＞.",
    });
    const printed = getCardDefinition("BT17-065")!.effectText!;
    expect(printed).toContain("[Digivolve][Dorugamon]: Cost 0");
    expect(printed).toContain(
      "[Trash] [All Turns] When one of your [Dorugamon] would be deleted, by digivolving it into this card without paying the cost, prevent that deletion.",
    );
    expect(printed).toContain(
      "[When Digivolving] Trash 1 card in your hand. Then, ＜Draw 1＞. If [Dorugamon] is in this Digimon's digivolution cards or this digivolved from the trash, delete 1 of your opponent's Digimon with a play cost of 4 or less instead.",
    );
    expect(compiled.digivolutionRequirement).toEqual([{ namesExact: ["Dorugamon"], cost: 0, isAlternate: true }]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("shapes the [Trash] replacement to digivolve from trash before preventing deletion", () => {
    const replacement = compiled.effects.find((entry) => entry.isFromTrash)?.actions[0] as any;
    expect(replacement).toMatchObject({
      kind: "Replacement",
      event: "wouldBeDeleted",
      target: {
        filter: { controller: "mine", nameOrTrait: [{ tokens: ["Dorugamon"], match: "nameExact" }] },
      },
      sourceFilter: { zone: "trash", controller: "mine" },
      leaveCause: "any",
      digivolveFromTrash: true,
      abortOnDecline: true,
    });
  });

  it("shapes [When Digivolving] as mandatory hand trash, then draw-or-delete on the same condition (Q2820)", () => {
    const actions = compiled.effects.find((entry) => entry.trigger === "WhenDigivolving")?.actions;
    expect(actions?.[0]).toMatchObject({
      kind: "Trash",
      target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
    });
    expect(actions?.[1]).toMatchObject({
      kind: "Draw",
      amount: 1,
      condition: { kind: "not", condition: { kind: "anyOf" } },
    });
    expect(actions?.[2]).toMatchObject({
      kind: "Delete",
      target: { filter: { controller: "opponent", playCostLte: 4 }, count: 1 },
      condition: { kind: "anyOf" },
    });
  });

  it("digivolves Dorugamon through the [Dorugamon] cost-0 route, then deletes a play-cost-4-or-less Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-062", as: "dorugamon" }],
          hand: [
            { card: "BT17-065", as: "dexDorugamon" },
            { card: "BT1-011", as: "toTrash" },
          ],
          deck: [{ card: "BT1-012", as: "bonusDraw" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowCost" },
            { card: "BT17-025", as: "highCost" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    const dorugamonId = s.perm("dorugamon").permanentId;
    const dexId = s.inst("dexDorugamon").instanceId;
    const lowCostId = s.perm("lowCost").permanentId;
    const highCostId = s.perm("highCost").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: dorugamonId,
        instanceId: dexId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowCostId));

    const evolved = s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === dorugamonId);
    expect(evolved?.topCard.cardId).toBe("BT17-065");
    expect(evolved?.stack.some((card) => card.cardId === "BT7-062")).toBe(true);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === highCostId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-011")).toBe(true);
    expect(s.state.players[0]!.deck.some((card) => card.cardId === "BT1-012")).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("digivolves from a non-Dorugamon Lv3 through the normal route, so it draws instead of deleting", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-063", as: "dorumon" }],
          hand: [
            { card: "BT17-065", as: "dexDorugamon" },
            { card: "BT1-011", as: "toTrash" },
          ],
          deck: [
            { card: "BT1-012", as: "bonusDraw" },
            { card: "BT1-013", as: "effectDraw" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "safe" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const dorumonId = s.perm("dorumon").permanentId;
    const dexId = s.inst("dexDorugamon").instanceId;
    const safeId = s.perm("safe").permanentId;
    const trashBefore = s.state.players[0]!.trash.length;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: dorumonId,
        instanceId: dexId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.deck.length === 0);

    const evolved = s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === dorumonId);
    expect(evolved?.topCard.cardId).toBe("BT17-065");
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.length).toBe(trashBefore + 1);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === safeId)).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("refuses the exact [Dorugamon] route for a near-name source (DexDorugamon), proving namesExact", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT9-075", as: "nearName" }],
        hand: [{ card: "BT17-065", as: "dexDorugamon" }],
      },
    });
    s.state.memory = 3;
    await s.ready();
    const nearNameId = s.perm("nearName").permanentId;
    const dexId = s.inst("dexDorugamon").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: nearNameId,
        instanceId: dexId,
        useAlternateCost: true,
      }),
    ).not.toEqual({ ok: true });
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: nearNameId,
        instanceId: dexId,
      }),
    ).not.toEqual({ ok: true });

    expect(s.perm("nearName").topCard.cardId).toBe("BT9-075");
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === dexId)).toBe(true);
    expect(s.state.memory).toBe(3);
  });

  it("digivolves from trash to prevent Dorugamon's deletion, then trashes and deletes instead of drawing (Q2817, Q2820)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-062", as: "dorugamon" }],
          trash: [{ card: "BT17-065", as: "dexDorugamon" }],
          hand: [{ card: "BT1-009", as: "discarded" }],
          deck: [{ card: "BT1-011", as: "bonusDraw" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const dorugamonId = s.perm("dorugamon").permanentId;
    const targetId = s.perm("target").permanentId;

    expect(await advance(s.engine).verb.deletePermanent([dorugamonId], "byEffect")).toBe(0);
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetId));

    const protectedDigimon = s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === dorugamonId);
    expect(protectedDigimon?.topCard.cardId).toBe("BT17-065");
    expect(protectedDigimon?.stack.some((card) => card.cardId === "BT7-062")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-009")).toBe(true);
  });

  it("Q2818/Q2819: carries a DP-zero deletion through the trash digivolution and never activates When Digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-062", as: "dorugamon", dp: 10000 }],
          trash: [{ card: "BT17-065", as: "dexDorugamon" }],
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
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT17-065")).toBe(true);
    expect(s.events).toContainEqual(
      expect.objectContaining({
        kind: "cardsMoved",
        instanceIds: expect.arrayContaining([s.inst("dexDorugamon").instanceId]),
        from: "trash",
        fromSeat: 0,
        to: "battleArea",
      }),
    );
    expect(
      s.events.some(
        (event) =>
          event.kind === "effectResolved" && event.sourceCardId === "BT17-065" && event.timing === "WhenDigivolving",
      ),
    ).toBe(false);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT7-062")).toBe(true);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT1-009"]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("allows Dorugamon's deletion when DexDorugamon is unavailable in trash", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT7-062", as: "dorugamon" }] },
      1: { battleArea: [{ card: "BT17-025", as: "target" }] },
    });
    const dorugamonId = s.perm("dorugamon").permanentId;
    const targetId = s.perm("target").permanentId;

    expect(await advance(s.engine).verb.deletePermanent([dorugamonId], "byEffect")).toBe(1);
    await settle(() => !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === dorugamonId));

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetId)).toBe(true);
  });

  it("grants inherited Reboot to a legal level-5 host", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT14-078", under: ["BT17-065"], as: "host" }] } });
    await s.ready();

    expect(s.perm("host").topCard.cardId).toBe("BT14-078");
    expect(s.perm("host").stack.some((card) => card.cardId === "BT17-065")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Reboot")).toBe(true);
  });
});

describe("BT17-065 DexDorugamon — Discord bug 1557128872544313456 (exact [Dorugamon])", () => {
  it.each(["BT17-065", "BT9-075"])(
    "does not offer the [Trash] replacement when DexDorugamon %s would be deleted",
    async (nearNameCardId) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: nearNameCardId, as: "nearName" }],
            trash: [{ card: "BT17-065", as: "dexDorugamon" }],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      await s.ready();

      expect(await advance(s.engine).verb.deletePermanent([s.perm("nearName").permanentId], "byEffect")).toBe(1);
      await settle();

      expect(s.decisions.filter(({ req }) => req.kind === "optional")).toEqual([]);
      expect(s.state.players[0]!.battleArea).toHaveLength(0);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("dexDorugamon").instanceId)).toBe(
        true,
      );
    },
  );

  it("draws instead of deleting when only a DexDorugamon is in its digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-063", under: ["BT9-075"], as: "dorumon" }],
          hand: [
            { card: "BT17-065", as: "dexDorugamon" },
            { card: "BT1-011", as: "toTrash" },
          ],
          deck: [
            { card: "BT1-012", as: "bonusDraw" },
            { card: "BT1-013", as: "effectDraw" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "safe" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const safeId = s.perm("safe").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("dorumon").permanentId,
        instanceId: s.inst("dexDorugamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("toTrash").instanceId));
    await settle();

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.perm("dorumon").topCard.cardId).toBe("BT17-065");
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("effectDraw").instanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === safeId)).toBe(true);
  });
});
