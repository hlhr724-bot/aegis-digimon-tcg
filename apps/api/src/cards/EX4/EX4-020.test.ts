import { describe, expect, it } from "vitest";
import { digiXrosRequirementFor, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { compiled } from "./EX4-020.js";
import "../index.js";

const CARD = "EX4-020";
const FILLER_DECK = ["BT1-010", "BT1-011", "BT1-012"];
const FILLER_SECURITY = ["BT1-014"];

describe("EX4-020 MetalGreymon", () => {
  it("matches catalog identity, evolution routes, residual-free IR, and exact DigiXros recipe", () => {
    expect(getCardDefinition(CARD)).toMatchObject({
      cardId: CARD,
      nameEn: "MetalGreymon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [
        { color: "Blue", level: 4, memoryCost: 4 },
        { color: "Black", level: 4, memoryCost: 4 },
      ],
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Cyborg", "Blue Flare"],
    });
    expect(runtimeCompiledCard(CARD)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digiXrosRequirement).toEqual([
      { materials: [{ names: ["Greymon"], colors: ["Blue"] }, { names: ["MailBirdramon"] }], count: 2 },
    ]);
    expect(digiXrosRequirementFor(CARD)).toEqual(compiled.digiXrosRequirement);
  });

  it("encodes Material Save 2, Rush, DigiXros trashing, and the inherited Q3460 restriction", () => {
    expect(compiled.effects).toMatchObject([
      { trigger: "Static", keywords: [{ keyword: "MaterialSave", amount: 2 }] },
      {
        trigger: "OnPlay",
        actions: [
          { kind: "GainKeyword", keyword: { keyword: "Rush" }, duration: "forTheTurn" },
          {
            kind: "TrashDigivolution",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            amount: 2,
            fromTop: false,
            upTo: true,
            condition: { kind: "digiXrosCount", minimum: 1 },
          },
        ],
      },
      {
        trigger: "WhenAttacking",
        isInherited: true,
        actions: [
          {
            kind: "Restrict",
            restriction: "attack",
            duration: "untilOpponentTurnEnd",
            target: {
              filter: { controller: "opponent", kind: ["Digimon"], digivolutionCardsAtMost: 3 },
              count: 1,
            },
            condition: { kind: "selfHasName", names: ["GreyKnightsmon"] },
          },
        ],
      },
    ]);
  });

  it("publicly DigiXroses Blue Greymon and MailBirdramon at cost 3, trashes two sources, and gains Rush", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: CARD, as: "metal" },
            { card: "EX4-016", as: "greymon" },
            { card: "EX4-018", as: "mailbirdramon" },
          ],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
        1: {
          battleArea: [{ card: "BT1-014", as: "target", under: ["BT1-009", "BT1-010", "BT1-011"] }],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("metal").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === CARD));

    const played = s.perm("metal");
    expect(s.state.memory).toBe(0);
    expect(played.topCard?.cardId).toBe(CARD);
    expect(played.stack.map(({ cardId }) => cardId)).toEqual(expect.arrayContaining(["EX4-016", "EX4-018"]));
    expect(observe(s.engine).hasKeyword(played, "Rush")).toBe(true);
    expect(s.perm("target").stack).toHaveLength(1);
  });

  it("rejects a red Greymon from the Blue Greymon DigiXros slot", () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: CARD, as: "metal" },
          { card: "BT1-015", as: "redGreymon" },
          { card: "EX4-018", as: "mailbirdramon" },
        ],
      },
    });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("metal").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("redGreymon").instanceId, s.inst("mailbirdramon").instanceId],
        },
      }),
    ).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual([CARD, "BT1-015", "EX4-018"]);
    expect(s.state.memory).toBe(3);
  });

  it("allows declining the optional second source while DigiXrosing", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: CARD, as: "metal" },
            { card: "EX4-016", as: "greymon" },
            { card: "EX4-018", as: "mailbirdramon" },
          ],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
        1: {
          battleArea: [{ card: "BT1-014", as: "target", under: ["BT1-009", "BT1-010", "BT1-011"] }],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("metal").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("greymon").instanceId, s.inst("mailbirdramon").instanceId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === CARD));

    expect(s.perm("target").stack).toHaveLength(2);
  });

  it("gains Rush on an ordinary public play without DigiXros trashing", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: CARD, as: "metal" }], deck: FILLER_DECK, security: FILLER_SECURITY },
        1: {
          battleArea: [{ card: "BT1-014", as: "target", under: ["BT1-009", "BT1-010"] }],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 7;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("metal").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === CARD));

    expect(s.state.memory).toBe(0);
    expect(observe(s.engine).hasKeyword(s.perm("metal"), "Rush")).toBe(true);
    expect(s.perm("target").stack).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("metal").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
  });

  it.each([
    ["blue", "BT10-019"],
    ["black", "EX4-044"],
  ])("digivolves from a %s level-4 Digimon for 4, draws, and preserves source identity", async (_label, baseCard) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: baseCard, as: "base" }],
        hand: [{ card: CARD, as: "metal" }],
        deck: FILLER_DECK,
        security: FILLER_SECURITY,
      },
    });
    s.state.turnSeat = 0;
    s.state.memory = 4;
    await s.ready();
    const permanentId = s.perm("base").permanentId;
    const sourceInstanceId = s.inst("base").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId,
        instanceId: s.inst("metal").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === CARD);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT1-010");
    expect(s.perm("base").permanentId).toBe(permanentId);
    expect(s.perm("base").topCard?.instanceId).toBe(s.inst("metal").instanceId);
    expect(s.perm("base").stack.map(({ instanceId }) => instanceId)).toEqual([sourceInstanceId]);
  });

  it("rejects a red level-4 evolution route without moving, paying, or drawing", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-015", as: "redBase" }],
        hand: [{ card: CARD, as: "metal" }],
        deck: FILLER_DECK,
        security: FILLER_SECURITY,
      },
    });
    s.state.turnSeat = 0;
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("metal").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(4);
    expect(s.perm("redBase").topCard?.cardId).toBe("BT1-015");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual([CARD]);
    expect(s.state.players[0]!.deck.map(({ cardId }) => cardId)).toEqual(FILLER_DECK);
  });

  it("restricts one opposing target at three sources, and Q3460 keeps it restricted after a fourth", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX4-021", as: "greyKnights", under: [CARD] }],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
        1: {
          battleArea: [
            { card: "BT1-014", as: "eligible", under: ["BT1-009", "BT1-010", "BT1-011"] },
            { card: "BT1-014", as: "ineligible", under: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"] },
          ],
          hand: [{ card: "BT1-013", as: "newSource" }],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("greyKnights").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestricted(s.perm("eligible"), "attack"));

    expect(observe(s.engine).isRestricted(s.perm("eligible"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("ineligible"), "attack")).toBe(false);
    await advance(s.engine).verb.placeUnder(s.perm("eligible").permanentId, [s.inst("newSource").instanceId]);
    expect(s.perm("eligible").stack).toHaveLength(4);
    expect(observe(s.engine).isRestricted(s.perm("eligible"), "attack")).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 0;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    expect(observe(s.engine).isRestricted(s.perm("eligible"), "attack")).toBe(false);
  });

  it("does not activate the inherited restriction when the stack top is not GreyKnightsmon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-014", as: "otherTop", under: [CARD] }],
        deck: FILLER_DECK,
        security: FILLER_SECURITY,
      },
      1: {
        battleArea: [{ card: "BT1-014", as: "target", under: ["BT1-009", "BT1-010", "BT1-011"] }],
        deck: FILLER_DECK,
        security: FILLER_SECURITY,
      },
    });
    s.state.turnSeat = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("otherTop").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);
  });

  it("moves two DigiXros materials under a Tamer when Material Save is accepted", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-088", as: "kiriha" },
            { card: CARD, as: "metal", under: ["EX4-016", "EX4-018"] },
          ],
          deck: FILLER_DECK,
          security: FILLER_SECURITY,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("metal").permanentId], "byEffect");
    await settle(() => s.perm("kiriha").stack.length === 2);

    expect(s.perm("kiriha").stack.map(({ cardId }) => cardId)).toEqual(expect.arrayContaining(["EX4-016", "EX4-018"]));
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain(CARD);
  });
});
