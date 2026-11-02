import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type BoardSpec, type SetupEngineOptions } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX2-028.js";
import "./EX2-028.js";
import "./EX2-029.js";
import "./EX2-014.js";
import "../BT1/BT1-009.js";
import "../BT1/BT1-010.js";
import "../BT1/BT1-011.js";
import "../BT1/BT1-012.js";
import "../BT1/BT1-013.js";
import "../BT1/BT1-014.js";
import "../BT1/BT1-075.js";

const inertSecurity = ["BT1-009", "BT1-010"];

describe("EX2-028 Parasitemon", () => {
  it("matches the catalog and compiled IR for both inherited clauses and End of Attack", () => {
    expect(getCardDefinition("EX2-028")).toMatchObject({
      cardId: "EX2-028",
      nameEn: "Parasitemon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [{ color: "Green", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Parasite"],
      effectText: "[End of Attack] You may place this Digimon as 1 of your other Digimon's bottom digivolution card.",
      inheritedEffectText:
        "＜Security Attack +1＞ (This Digimon checks 1 additional security card.) [Your Turn] This Digimon gets +2000 DP.",
    });
    expect(compiled).toMatchObject({
      effects: [
        {
          trigger: "EndOfAttack",
          actions: [
            {
              kind: "PlaceUnder",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              underFilter: { controller: "mine", kind: ["Digimon"], excludeSelf: true },
              targetIsPermanent: true,
              shedOwnCards: true,
              position: "bottom",
              optional: true,
            },
          ],
        },
        {
          trigger: "Static",
          isInherited: true,
          keywords: [{ keyword: "SecurityAttack", amount: 1 }],
        },
        {
          trigger: "YourTurn",
          isInherited: true,
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              amount: 2000,
              duration: "permanent",
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gives its host +2000 DP and Security Attack +1 during its turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX2-029", as: "host", under: ["EX2-028"] }],
        deck: ["BT1-011"],
        security: inertSecurity,
      },
    });
    await s.ready();
    expect(s.perm("host").currentDP).toBe(15000);
    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(1);
  });

  it("keeps Security Attack +1 on the opponent's turn but not the inherited DP boost", async () => {
    const ownTurn = setupEngine({
      0: {
        battleArea: [{ card: "EX2-029", as: "host", under: ["EX2-028"] }],
        deck: ["BT1-011"],
        security: inertSecurity,
      },
      1: { deck: ["BT1-012"], security: inertSecurity },
    });
    await ownTurn.ready();
    expect(ownTurn.perm("host").currentDP).toBe(15000);
    expect(observe(ownTurn.engine).keywordAmount(ownTurn.perm("host"), "SecurityAttack")).toBe(1);

    const opponentTurn = setupEngine({
      0: {
        battleArea: [{ card: "EX2-029", as: "host", under: ["EX2-028"] }],
        deck: ["BT1-011", "BT1-012"],
        security: inertSecurity,
      },
      1: { hand: ["BT1-009"], deck: ["BT1-013", "BT1-014"], security: inertSecurity },
    });
    await opponentTurn.ready();
    const turnLoop = opponentTurn.engine.startTurnLoop();
    await advance(opponentTurn.engine).waitForMainPhase(0);
    advance(opponentTurn.engine).endMainPhaseIfOpen(0);
    await advance(opponentTurn.engine).waitForMainPhase(1);
    expect(opponentTurn.perm("host").currentDP).toBe(13000);
    expect(observe(opponentTurn.engine).keywordAmount(opponentTurn.perm("host"), "SecurityAttack")).toBe(1);
    expect(opponentTurn.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await turnLoop;
  });

  it("places itself under another Digimon at end of attack, never under itself", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX2-028", as: "parasite", under: [{ card: "BT1-075", as: "parasiteSource" }] },
            { card: "EX2-014", as: "other", under: [{ card: "EX2-025", as: "existingSource" }] },
          ],
        },
        1: { security: inertSecurity },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("parasite").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("other").stack.some((card) => card.instanceId === s.inst("parasite").instanceId));
    expect(s.perm("other").stack.map((card) => card.cardId)).toEqual(["EX2-028", "EX2-025"]);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("parasiteSource").instanceId)).toBe(
      true,
    );
  });

  it("supports legal green level-5 evolution with paid cost and preserved source stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-075", as: "source" }],
          hand: [{ card: "EX2-028", as: "evolution" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          security: inertSecurity,
        },
        1: { deck: ["BT1-013", "BT1-014"], security: inertSecurity },
      },
      { autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard.cardId === "EX2-028");
    expect(s.state.memory).toBe(7);
    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual(["BT1-075"]);
    expect(s.state.players[0]!.deck).toHaveLength(3);
  });

  it("rejects evolution from a blue level-4 source", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX2-014", as: "blueSource" }],
        hand: [{ card: "EX2-028", as: "evolution" }],
        deck: ["BT1-009", "BT1-010"],
        security: inertSecurity,
      },
    });
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("blueSource").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.perm("blueSource").topCard.cardId).toBe("EX2-014");
    expect(s.state.memory).toBe(10);
  });

  it("may decline placing itself under another Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX2-028", as: "parasite" },
            { card: "EX2-014", as: "other" },
          ],
        },
        1: { security: inertSecurity },
      },
      { autoDeclineOptional: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("parasite").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX2-028")).toBe(true);
    expect(s.perm("other").stack.some((card) => card.cardId === "EX2-028")).toBe(false);
  });
});

describe("EX2-028 Parasitemon — KB Q&A rulings", () => {
  async function attackThenEndOfAttack(board: BoardSpec, options: SetupEngineOptions = {}) {
    const s = setupEngine(board, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoOrderTriggers: true,
      ...options,
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("parasite").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    await settle(() => s.state.pendingDecision === undefined);
    return s;
  }

  it("places only itself, trashing its own digivolution cards (Q3320)", async () => {
    const s = await attackThenEndOfAttack({
      0: {
        battleArea: [
          {
            card: "EX2-028",
            as: "parasite",
            under: [
              { card: "BT1-075", as: "bottomSource" },
              { card: "EX2-029", as: "topSource" },
            ],
          },
          { card: "EX2-014", as: "other" },
        ],
      },
      1: { security: inertSecurity },
    });
    expect(s.perm("other").stack.map((card) => card.instanceId)).toEqual([s.inst("parasite").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("bottomSource").instanceId, s.inst("topSource").instanceId]),
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("can place itself under a Digimon without a level (Q3321)", async () => {
    const s = await attackThenEndOfAttack({
      0: {
        battleArea: [
          { card: "EX2-028", as: "parasite" },
          { card: "EX2-046", as: "levelless" },
        ],
      },
      1: { security: inertSecurity },
    });
    expect(s.perm("levelless").topCard.cardId).toBe("EX2-046");
    expect(s.perm("levelless").stack.map((card) => card.instanceId)).toEqual([s.inst("parasite").instanceId]);
  });

  it("grants both inherited effects to the Digimon it is placed under (Q3322)", async () => {
    const s = await attackThenEndOfAttack({
      0: {
        battleArea: [
          { card: "EX2-028", as: "parasite" },
          { card: "EX2-014", as: "other", dp: 4000 },
        ],
      },
      1: { security: inertSecurity },
    });
    expect(s.perm("other").stack.map((card) => card.cardId)).toEqual(["EX2-028"]);
    expect(s.perm("other").currentDP).toBe(6000);
    expect(observe(s.engine).keywordAmount(s.perm("other"), "SecurityAttack")).toBe(1);
  });

  it("cannot place itself under itself (Q3323)", async () => {
    const s = await attackThenEndOfAttack(
      {
        0: { battleArea: [{ card: "EX2-028", as: "parasite", under: [{ card: "BT1-075", as: "source" }] }] },
        1: { security: inertSecurity },
      },
      { autoSelectCards: false },
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("parasite").topCard.instanceId).toBe(s.inst("parasite").instanceId);
    expect(s.perm("parasite").stack.map((card) => card.instanceId)).toEqual([s.inst("source").instanceId]);
    const parasiteOffered = s.decisions.some(({ req }) =>
      req.options?.candidateInstanceIds?.some(
        (id) => id === s.perm("parasite").permanentId || id === s.inst("parasite").instanceId,
      ),
    );
    expect(parasiteOffered).toBe(false);
  });
});
