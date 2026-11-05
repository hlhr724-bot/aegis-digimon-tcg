import { describe, expect, it } from "vitest";
import { digiXrosRequirementFor, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "../index.js";

const EX4_021 = "EX4-021";
const BLUE_METALGREYMON = "EX4-020";
const DARKKNIGHTMON = "BT7-063";
const FILLER_DECK = ["BT1-010", "BT1-011", "BT1-012"];

describe("EX4-021 GreyKnightsmon", () => {
  it("registers the official identity, legal evolution routes, and complete residual-free IR", () => {
    expect(getCardDefinition(EX4_021)).toMatchObject({
      cardId: EX4_021,
      nameEn: "GreyKnightsmon",
      colors: ["Blue", "Black"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [
        { color: "Blue", level: 5, memoryCost: 5 },
        { color: "Black", level: 5, memoryCost: 5 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Dark Knight", "Blue Flare", "Twilight"],
    });
    expect(runtimeCompiledCard(EX4_021)).toMatchObject({ coverage: "full", residual: [] });
    expect(runtimeCompiledCard(EX4_021)).toMatchObject({
      digiXrosRequirement: [
        { materials: [{ names: ["MetalGreymon"], colors: ["Blue"] }, { names: ["DarkKnightmon"] }], count: 2 },
      ],
    });
    expect(digiXrosRequirementFor(EX4_021)).toEqual(runtimeCompiledCard(EX4_021)?.digiXrosRequirement);
  });

  it("maps both printed clauses to exact IR", () => {
    expect(runtimeCompiledCard(EX4_021)?.effects?.[0]?.actions).toMatchObject([
      { kind: "DeDigivolve", amount: 1, target: { count: 1, filter: { controller: "opponent", kind: ["Digimon"] } } },
      {
        kind: "Restrict",
        restriction: "attack",
        duration: "untilOpponentTurnEnd",
        whileMatchesTargetFilter: true,
        target: {
          count: "all",
          filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
        },
      },
    ]);
    expect(runtimeCompiledCard(EX4_021)?.effects?.[1]?.actions?.[0]).toMatchObject({
      kind: "Replacement",
      event: "wouldLeavePlay",
      sourceFilter: { isSelfRef: true },
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["digivolutionCards"],
          fromOwnDigivolutionStack: true,
          payCost: false,
          target: { filter: { nameOrTrait: [{ match: "nameExact", tokens: ["MetalGreymon"] }] } },
        },
        {
          kind: "PlayWithoutCost",
          from: ["digivolutionCards"],
          fromOwnDigivolutionStack: true,
          payCost: false,
          target: { filter: { nameOrTrait: [{ match: "nameExact", tokens: ["DarkKnightmon"] }] } },
        },
      ],
    });
  });

  it.each([
    ["blue", "EX4-019"],
    ["black", "EX4-045"],
  ])("digivolves from a %s level-5 Digimon for 5, draws, and preserves source identity", async (_color, baseCard) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: baseCard, as: "base" }],
        hand: [{ card: EX4_021, as: "greyKnights" }],
        deck: FILLER_DECK,
      },
    });
    s.state.memory = 5;
    await s.ready();
    const permanentId = s.perm("base").permanentId;
    const sourceInstanceId = s.inst("base").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId,
        instanceId: s.inst("greyKnights").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === EX4_021);

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").permanentId).toBe(permanentId);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("greyKnights").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([sourceInstanceId]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain(FILLER_DECK[0]);
  });

  it("DigiXroses Blue MetalGreymon and DarkKnightmon for a total cost of 8", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: EX4_021, as: "greyKnights" },
            { card: BLUE_METALGREYMON, as: "metalGreymon" },
            { card: DARKKNIGHTMON, as: "darkKnightmon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 8;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("greyKnights").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("metalGreymon").instanceId, s.inst("darkKnightmon").instanceId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === EX4_021));

    const played = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === EX4_021);
    expect(played).toBeDefined();
    expect(s.state.memory).toBe(0);
    expect(played!.stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining([BLUE_METALGREYMON, DARKKNIGHTMON]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("plays normally for 12, de-digivolves one target, and dynamically restricts every opposing level 4 or lower Digimon (Q3461)", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: EX4_021, as: "greyKnights" }] },
        1: {
          battleArea: [{ card: "EX4-020", as: "changing", under: ["EX4-016"] }],
          hand: [{ card: "EX4-019", as: "levelFive" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("greyKnights").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("changing").topCard.cardId === "EX4-016");

    expect(s.state.memory).toBe(0);
    expect(observe(s.engine).isRestricted(s.perm("changing"), "attack")).toBe(true);
    const newcomer = s.putOnBoard(1, { card: "EX4-016" });
    await s.ready();
    expect(observe(s.engine).isRestricted(newcomer, "attack")).toBe(true);

    await advance(s.engine).verb.digivolveFromInstance(s.perm("changing").permanentId, s.inst("levelFive").instanceId, {
      costOverride: 0,
    });

    expect(s.perm("changing").topCard.cardId).toBe("EX4-019");
    expect(observe(s.engine).isRestricted(s.perm("changing"), "attack")).toBe(false);
    expect(observe(s.engine).isRestricted(newcomer, "attack")).toBe(true);
  });

  it("rejects the illegal level-4 evolution route without moving, paying, or drawing", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-015", as: "redBase" }],
        hand: [{ card: EX4_021, as: "greyKnights" }],
        deck: FILLER_DECK,
      },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("greyKnights").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(5);
    expect(s.perm("redBase").topCard.cardId).toBe("BT1-015");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([EX4_021]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(FILLER_DECK);
  });

  it("rejects a non-blue MetalGreymon from the Blue MetalGreymon DigiXros slot", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: EX4_021, as: "greyKnights" },
          { card: "BT1-021", as: "redMetalGreymon" },
          { card: DARKKNIGHTMON, as: "darkKnightmon" },
        ],
      },
    });
    s.state.memory = 8;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("greyKnights").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("redMetalGreymon").instanceId, s.inst("darkKnightmon").instanceId],
        },
      }),
    ).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.state.memory).toBe(8);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([EX4_021, "BT1-021", DARKKNIGHTMON]);
  });

  it.each([
    ["deleted", "delete"],
    ["returned to hand", "hand"],
    ["returned to deck", "deck"],
  ])("plays both exact cards from its own stack when %s", async (_label, destination) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: EX4_021, as: "greyKnights", under: [BLUE_METALGREYMON, DARKKNIGHTMON] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    if (destination === "delete") {
      await advance(s.engine).verb.deletePermanent([s.perm("greyKnights").permanentId], "byEffect");
    } else if (destination === "hand") {
      await advance(s.engine).verb.returnToHand([s.perm("greyKnights").topCard.instanceId]);
    } else {
      await advance(s.engine).verb.returnToDeck([s.perm("greyKnights").topCard.instanceId], { toTop: false });
    }
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId).sort()).toEqual(
      [BLUE_METALGREYMON, DARKKNIGHTMON].sort(),
    );
    const destinationCards =
      destination === "delete"
        ? s.state.players[0]!.trash
        : destination === "hand"
          ? s.state.players[0]!.hand
          : s.state.players[0]!.deck;
    expect(destinationCards.map((card) => card.cardId)).toContain(EX4_021);
  });

  it("does not borrow exact cards from another stack or accept name-containing variants", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: EX4_021, as: "greyKnights", under: ["BT9-015", "BT10-069"] },
            { card: "BT1-009", as: "donor", under: [BLUE_METALGREYMON, DARKKNIGHTMON] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("greyKnights").permanentId], "byEffect");

    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("donor").stack.map((card) => card.cardId)).toEqual([BLUE_METALGREYMON, DARKKNIGHTMON]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining([EX4_021, "BT9-015", "BT10-069"]),
    );
  });

  it("may decline the leave-play effect without replaying either source", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: EX4_021, as: "greyKnights", under: [BLUE_METALGREYMON, DARKKNIGHTMON] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("greyKnights").permanentId], "byEffect");

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining([EX4_021, BLUE_METALGREYMON, DARKKNIGHTMON]),
    );
  });
});
