import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";

const INERT_DECK = ["BT1-010", "BT1-011", "BT1-012", "BT1-013"];
const INERT_SECURITY = ["BT1-009", "BT1-014"];

describe("EX4-016 Greymon", () => {
  it("matches the catalog and compiles every printed clause without residuals", () => {
    expect(getCardDefinition("EX4-016")).toMatchObject({
      cardId: "EX4-016",
      nameEn: "Greymon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 4000,
      evoCosts: [
        { color: "Blue", level: 3, memoryCost: 3 },
        { color: "Black", level: 3, memoryCost: 3 },
      ],
      types: ["Dinosaur", "Blue Flare"],
    });
    expect(runtimeCompiledCard("EX4-016")).toMatchObject({ coverage: "full", residual: [] });
    expect(runtimeCompiledCard("EX4-016")?.effects).toMatchObject([
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "RevealAdd",
            revealCount: 3,
            rest: "trash",
            add: [
              { count: 1, to: "hand", filter: { nameOrTrait: [{ match: "name", tokens: ["Kiriha Aonuma"] }] } },
              {
                count: 1,
                to: "hand",
                filter: { colors: ["Blue", "Black"], hasDigiXrosRequirements: true },
              },
            ],
          },
        ],
      },
      {
        trigger: "OnDeletion",
        keywords: [{ keyword: "Save" }],
        actions: [
          {
            kind: "PlaceUnder",
            position: "bottom",
            optional: true,
            target: { isSelf: true, filter: { isSelfRef: true } },
            underFilter: { controller: "mine", kind: ["Tamer"] },
          },
        ],
      },
      { trigger: "WhenAttacking", isInherited: true, actions: [{ kind: "Draw", controller: "mine", amount: 1 }] },
    ]);
  });

  it("publicly plays, reveals exactly three, adds both targets, and trashes only the rest (Q3458)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX4-016", as: "greymon" }],
          deck: ["BT10-088", "BT10-024", "BT1-010", "BT1-011"],
          security: INERT_SECURITY,
        },
        1: { deck: INERT_DECK, security: INERT_SECURITY },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("greymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT1-010"));

    expect(s.state.memory).toBe(6);
    expect(s.state.players[0]!.battleArea.map((perm) => perm.topCard?.cardId)).toEqual(["EX4-016"]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId).sort()).toEqual(["BT10-024", "BT10-088"].sort());
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-010"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-011"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("adds the only available Kiriha target and trashes the other two reveals (Q3457)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX4-016", as: "greymon" }],
          deck: ["BT10-088", "BT1-010", "BT1-011", "BT1-012"],
          security: INERT_SECURITY,
        },
        1: { deck: INERT_DECK, security: INERT_SECURITY },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("greymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.length === 2);

    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT10-088"]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-010", "BT1-011"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-012"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not accept a non-DigiXros blue card and trashes all three non-target reveals", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX4-016", as: "greymon" }],
          deck: ["BT1-028", "BT1-010", "BT1-011", "BT1-012"],
          security: INERT_SECURITY,
        },
        1: { deck: INERT_DECK, security: INERT_SECURITY },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("greymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.length === 3);

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-028", "BT1-010", "BT1-011"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-012"]);
  });

  it.each([
    ["Blue", "BT1-028"],
    ["Black", "BT2-052"],
  ])("digivolves through the %s Lv.3 route for 3 and preserves source identity", async (_label, sourceCard) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: sourceCard, as: "source" }],
          hand: [{ card: "EX4-016", as: "greymon" }],
          deck: ["BT1-010", "BT1-011"],
          security: INERT_SECURITY,
        },
        1: { deck: INERT_DECK, security: INERT_SECURITY },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();
    const sourceInstanceId = s.inst("source").instanceId;
    const permanentId = s.perm("source").permanentId;

    expect(
      s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: s.inst("greymon").instanceId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.perm("source").topCard?.cardId === "EX4-016");

    expect(s.state.memory).toBe(0);
    expect(s.perm("source").permanentId).toBe(permanentId);
    expect(s.perm("source").topCard?.instanceId).toBe(s.inst("greymon").instanceId);
    expect(s.perm("source").stack.map((card) => card.instanceId)).toEqual([sourceInstanceId]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-010"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-011"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("rejects a red Lv.3 source without paying, moving, or drawing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "illegal" }],
          hand: [{ card: "EX4-016", as: "greymon" }],
          deck: ["BT1-010", "BT1-011"],
          security: INERT_SECURITY,
        },
        1: { deck: INERT_DECK, security: INERT_SECURITY },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("illegal").permanentId,
        instanceId: s.inst("greymon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(3);
    expect(s.perm("illegal").topCard?.cardId).toBe("BT1-009");
    expect(s.perm("illegal").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX4-016"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-010", "BT1-011"]);
  });

  it("draws from the inherited clause through a public attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "host", under: ["EX4-016"] }],
          deck: ["BT1-010"],
          security: INERT_SECURITY,
        },
        1: { deck: INERT_DECK, security: ["BT1-014"] },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "BT1-010"));

    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-010"]);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("publicly resolves optional Save under its own Tamer at the stack bottom", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX4-016", as: "greymon", suspended: true },
            { card: "BT10-088", as: "tamer", under: [{ card: "BT1-010", as: "existing" }] },
          ],
          deck: INERT_DECK,
          security: INERT_SECURITY,
        },
        1: {
          battleArea: [
            { card: "BT1-013", as: "attacker" },
            { card: "BT10-088", as: "opponentTamer" },
          ],
          deck: INERT_DECK,
          security: INERT_SECURITY,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    const savedInstanceId = s.perm("greymon").topCard!.instanceId;
    const existingInstanceId = s.inst("existing").instanceId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("greymon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.some((card) => card.instanceId === savedInstanceId));

    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([savedInstanceId, existingInstanceId]);
    expect(s.perm("opponentTamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === savedInstanceId)).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("declining optional Save leaves the battle-deleted card in its owner's trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX4-016", as: "greymon", suspended: true },
            { card: "BT10-088", as: "tamer" },
          ],
          deck: INERT_DECK,
          security: INERT_SECURITY,
        },
        1: { battleArea: [{ card: "BT1-013", as: "attacker" }], deck: INERT_DECK, security: INERT_SECURITY },
      },
      { autoDeclineOptional: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    const savedInstanceId = s.perm("greymon").topCard!.instanceId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("greymon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === savedInstanceId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === savedInstanceId)).toBe(true);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
