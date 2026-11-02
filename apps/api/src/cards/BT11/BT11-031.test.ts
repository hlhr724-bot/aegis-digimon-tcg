import { describe, expect, it } from "vitest";
import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT11-031.js";

describe("BT11-031 ZeigGreymon", () => {
  it("matches the catalog and carries every complete printed contract", () => {
    expect(getCardDefinition("BT11-031")).toMatchObject({
      cardId: "BT11-031",
      nameEn: "ZeigGreymon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [
        { color: "Blue", level: 5, memoryCost: 3 },
        { color: "Red", level: 5, memoryCost: 3 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Cyborg", "BlueFlare"],
    });
    expect(compiled).toMatchObject({
      effects: [
        { trigger: "WhenDigivolving", actions: [{ kind: "Unsuspend" }, { kind: "GainMemory", amount: 2 }] },
        {
          trigger: "OnDeletion",
          keywords: [{ keyword: "Save" }],
          actions: [{ kind: "PlaceUnder" }, { kind: "PlaceUnder" }, { kind: "PlaceUnder" }],
        },
        { trigger: "OpponentsTurn", isInherited: true, actions: [{ kind: "Aura" }] },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("publishes the exact MetalGreymon alternate route", () => {
    expect(digivolutionRequirementsFor("BT11-031")).toContainEqual({
      cost: 2,
      isAlternate: true,
      namesExact: ["MetalGreymon"],
    });
  });

  it("unsuspends and gains 2 memory with a Blue Flare source and 2 opposing Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT10-024", as: "base", suspended: true }],
        hand: [{ card: "BT11-031", as: "zeig" }],
        deck: ["BT1-009"],
      },
      1: { battleArea: ["BT11-023", "BT11-023"] },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("zeig").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.perm("base").isSuspended && s.state.memory === 10);

    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.state.memory).toBe(10);
  });

  it("supports both normal colors for 3 and withholds memory when either condition is absent", async () => {
    for (const [base, opponents, expectedMemory] of [
      ["BT11-028", 1, 3],
      ["BT1-022", 2, 3],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: base, as: "base", suspended: true }],
          hand: [{ card: "BT11-031", as: "zeig" }],
        },
        1: { battleArea: Array.from({ length: opponents }, () => "BT11-023") },
      });
      s.state.memory = 6;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("zeig").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => !s.perm("base").isSuspended);
      expect(s.state.memory).toBe(expectedMemory);
    }
  });

  it("saves itself under any Tamer, then places blue Greymon and MailBirdramon under a General", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT11-031", as: "zeig" },
            { card: "BT11-095", as: "general" },
            { card: "BT11-095", as: "otherGeneral" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
          trash: [
            { card: "BT10-019", as: "greymon" },
            { card: "BT10-021", as: "mailBirdramon" },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-084", as: "attacker", dp: 15000, suspended: true }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    const zeigInstanceId = s.perm("zeig").topCard!.instanceId;
    const zeigPermanentId = s.perm("zeig").permanentId;
    const generalPermanentId = s.perm("general").permanentId;
    const greymonId = s.inst("greymon").instanceId;
    const mailBirdramonId = s.inst("mailBirdramon").instanceId;
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: zeigPermanentId,
        target: { kind: "permanent", permanentId: s.perm("attacker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("general").stack.length === 3);

    expect(s.perm("general").permanentId).toBe(generalPermanentId);
    expect(s.perm("general").stack.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([zeigInstanceId, greymonId, mailBirdramonId]),
    );
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === zeigPermanentId)).toBe(false);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("otherGeneral").stack).toHaveLength(0);
    expect(s.state.memory).toBe(3);
  });

  it("places both cards under the same chosen General after declining Save", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT11-031", as: "zeig" },
            { card: "BT11-095", as: "otherGeneral" },
            { card: "BT11-095", as: "general" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
          trash: [
            { card: "BT10-024", as: "metalGreymon" },
            { card: "BT10-019", as: "greymon" },
            { card: "BT10-021", as: "mailBirdramon" },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-084", as: "attacker", dp: 15000, suspended: true }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("general").permanentId);

    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zeig").permanentId,
        target: { kind: "permanent", permanentId: s.perm("attacker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);

    expect(
      s
        .perm("general")
        .stack.map(({ instanceId }) => instanceId)
        .sort(),
    ).toEqual([s.inst("greymon").instanceId, s.inst("mailBirdramon").instanceId].sort());
    expect(s.perm("otherGeneral").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId).sort()).toEqual(["BT10-024", "BT11-031"]);
    const generalChoices = s.decisions.filter(
      ({ req }) =>
        req.kind === "chooseTargets" &&
        req.options?.candidateInstanceIds?.includes(s.perm("general").permanentId) &&
        req.options.candidateInstanceIds.includes(s.perm("otherGeneral").permanentId) &&
        req.options.candidateInstanceIds.length === 2,
    );
    expect(generalChoices).toHaveLength(1);
  });

  it("places only the blue MailBirdramon under a General when the trash has no blue Greymon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT11-031", as: "zeig" },
            { card: "BT11-095", as: "general" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
          trash: [{ card: "BT10-021", as: "mailBirdramon" }],
        },
        1: {
          battleArea: [{ card: "BT1-084", as: "attacker", dp: 15000, suspended: true }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );

    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zeig").permanentId,
        target: { kind: "permanent", permanentId: s.perm("attacker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);

    expect(s.perm("general").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("mailBirdramon").instanceId]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(["BT11-031"]);
  });

  it("does not place MailBirdramon when there is no General Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-031", as: "zeig" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
          trash: [{ card: "BT10-021", as: "mailBirdramon" }],
        },
        1: {
          battleArea: [{ card: "BT1-084", as: "attacker", dp: 15000, suspended: true }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zeig").permanentId,
        target: { kind: "permanent", permanentId: s.perm("attacker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId).sort()).toEqual(["BT10-021", "BT11-031"]);
  });

  it("inherited effect grants Blocker to a Blue Flare host on the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT12-112", as: "host", under: ["BT11-031"] }, "BT1-009"],
        security: [
          { card: "BT1-010", as: "security-one" },
          { card: "BT1-011", as: "security-two" },
        ],
        deck: ["BT1-012", "BT1-013"],
      },
      1: {
        battleArea: [{ card: "BT1-028", as: "attacker", dp: 1000 }],
        deck: ["BT1-014", "BT1-015"],
        security: ["BT1-016", "BT1-017"],
      },
    });
    s.state.turnSeat = 1;
    await advance(s.engine).recompute();

    expect(observe(s.engine).hasKeyword(s.perm("host"), "Blocker")).toBe(true);
    const attackerId = s.perm("attacker").permanentId;
    expect(
      s.engine.applyIntent(1, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("host").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.every(({ permanentId }) => permanentId !== attackerId));
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("security-one").instanceId,
      s.inst("security-two").instanceId,
    ]);
  });

  it("inherited Blocker requires both the opponent's turn and a Blue Flare host", async () => {
    for (const [host, turnSeat] of [
      ["BT12-112", 0],
      ["BT1-084", 1],
    ] as const) {
      const s = setupEngine({ 0: { battleArea: [{ card: host, as: "host", under: ["BT11-031"] }] } });
      s.state.turnSeat = turnSeat;
      await advance(s.engine).recompute();
      expect(observe(s.engine).hasKeyword(s.perm("host"), "Blocker")).toBe(false);
    }
  });
});
