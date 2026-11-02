import { describe, expect, it } from "vitest";
import { digivolutionRequirementsFor, getCardDefinition, type Seat } from "@aegis/shared";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { compiled } from "./BT27-034.js";
import "#api/cards/index";

const cardId = "BT27-034";

type Scenario = ReturnType<typeof setupEngine>;

function boardCardIds(s: Scenario, seat: 0 | 1): string[] {
  return s.state.players[seat]!.battleArea.map(({ topCard }) => topCard.cardId);
}

function trashCardIds(s: Scenario, seat: 0 | 1): string[] {
  return s.state.players[seat]!.trash.map(({ cardId }) => cardId);
}

function suspendedCardIds(s: Scenario, seat: 0 | 1): string[] {
  return s.state.players[seat]!.battleArea.filter((p) => p.isSuspended).map(({ topCard }) => topCard.cardId);
}

async function digivolve(s: Scenario, base: string, evolution: string): Promise<void> {
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm(base).permanentId,
      instanceId: s.inst(evolution).instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm(base).topCard.cardId === cardId && s.state.pendingDecision === undefined);
}

async function useOption(s: Scenario): Promise<void> {
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("option").instanceId));
}

describe("BT27-034 Examon (X Antibody)", () => {
  it("matches the printed Digimon and Option sides", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Examon (X Antibody)",
      colors: ["Blue", "Red", "Green"],
      kinds: ["Digimon", "Option"],
      level: 7,
      playCost: 6,
      dp: 16000,
      types: ["Holy Warrior", "X Antibody", "Royal Knight"],
      dualEffect: "Ultimate Battle Dragonlance Ambrose",
      isDualCard: true,
      optionColorRequirements: ["Red"],
    });
    expect(getCardDefinition(cardId)?.evoCosts).toEqual([
      { color: "Blue", level: 6, memoryCost: 6 },
      { color: "Red", level: 6, memoryCost: 6 },
      { color: "Green", level: 6, memoryCost: 6 },
    ]);
    expect(digivolutionRequirementsFor(cardId)).toEqual([{ namesExact: ["Examon"], cost: 2, isAlternate: true }]);
    expect(compiled.effects.map(({ trigger }) => trigger)).toEqual([
      "Static",
      "Static",
      "AllTurns",
      "AllTurns",
      "WhenDigivolving",
      "WhenAttacking",
      "Counter",
      "Main",
    ]);
  });

  it("cannot be played as a Digimon", async () => {
    const s = setupEngine({ 0: { hand: [{ card: cardId, as: "card" }] } });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "digimon" }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("has Raid, Piercing, Security A. +1, Blocker and Evade on the field", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "examon" }] } });
    await s.ready();
    expect([...s.perm("examon").keywords]).toEqual(
      expect.arrayContaining(["Raid", "Piercing", "SecurityAttack", "Blocker", "Evade"]),
    );
    expect(s.perm("examon").currentDP).toBe(16000);
  });

  it.each([
    { label: "a red level 6", base: "ST1-10", cost: 6 },
    { label: "a blue level 6", base: "ST2-10", cost: 6 },
    { label: "an [Examon]", base: "BT20-045", cost: 2 },
  ])("digivolves from $label for $cost memory", async ({ base, cost }) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: cardId, as: "evolution" }], deck: ["BT1-009"] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    await digivolve(s, "base", "evolution");
    expect(s.state.memory).toBe(10 - cost);
    expect(s.perm("base").stack.map(({ cardId: id }) => id)).toEqual([base]);
  });

  it("rejects a yellow level 6 evolution base", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "ST3-10", as: "base" }], hand: [{ card: cardId, as: "evolution" }] },
    });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
  });

  it("suspends up to 3 Digimon or Tamers on either side when digivolving", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST1-10", as: "base" },
            { card: "BT1-009", as: "ally" },
          ],
          hand: [{ card: cardId, as: "evolution" }],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "ST1-12", as: "tamer" },
            { card: "BT1-009", as: "spare" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.perm("ally").permanentId, s.perm("first").permanentId, s.perm("tamer").permanentId);
    s.state.memory = 10;
    await digivolve(s, "base", "evolution");
    expect(suspendedCardIds(s, 0)).toEqual(["BT1-009"]);
    expect(suspendedCardIds(s, 1)).toEqual(["BT1-009", "ST1-12"]);
    expect(s.perm("spare").isSuspended).toBe(false);
    expect(trashCardIds(s, 0)).toHaveLength(0);
  });

  it("trashes the ACE [Examon] it digivolved from, paying Overflow, to delete within the raised DP maximum", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-045", as: "base" }],
          hand: [{ card: cardId, as: "evolution" }],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "ST1-10" }, { card: "ST2-10" }, { card: "ST1-12" }, { card: "P-039", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Suspend"] },
    );
    await s.ready();
    s.state.memory = 10;
    await digivolve(s, "base", "evolution");
    expect(s.state.memory).toBe(3);
    expect(trashCardIds(s, 0)).toEqual(["BT20-045"]);
    expect(s.perm("base").stack).toHaveLength(0);
    expect(trashCardIds(s, 1)).toHaveLength(1);
    expect(boardCardIds(s, 1)).toEqual(expect.arrayContaining(["ST1-12", "P-039"]));
    expect(boardCardIds(s, 1)).toHaveLength(3);
  });

  it.each(["BT20-045", "EX5-070"])("pays with the named source %s when attacking", async (source) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "examon", under: [source] }], deck: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009" }], security: ["BT1-009"], deck: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Suspend"] },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("examon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => trashCardIds(s, 0).includes(source));
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(trashCardIds(s, 1)).toContain("BT1-009");
  });

  it.each(["BT9-109", "BT1-009"])("cannot pay with protected or non-matching %s", async (source) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST1-10", as: "base", under: [source] }],
          hand: [{ card: cardId, as: "evolution" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Suspend"] },
    );
    await s.ready();
    s.state.memory = 10;
    await digivolve(s, "base", "evolution");
    expect(trashCardIds(s, 0)).toHaveLength(0);
    expect(boardCardIds(s, 1)).toEqual(["BT1-009"]);
  });

  it("may refuse both the suspension and the source cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-045", as: "base" }],
          hand: [{ card: cardId, as: "evolution" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    await digivolve(s, "base", "evolution");
    expect(s.perm("base").stack.map(({ cardId: id }) => id)).toEqual(["BT20-045"]);
    expect(suspendedCardIds(s, 1)).toHaveLength(0);
    expect(boardCardIds(s, 1)).toEqual(["BT1-009"]);
  });

  it("shares one use per turn across When Digivolving and When Attacking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-045", as: "base", under: ["EX5-070"] }],
          hand: [{ card: cardId, as: "evolution" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-009" }], security: ["BT1-009"], deck: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Suspend"] },
    );
    await s.ready();
    s.state.memory = 10;
    await digivolve(s, "base", "evolution");
    expect(trashCardIds(s, 0)).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    s.putOnBoard(1, { card: "BT1-009", as: "later", suspended: true });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(trashCardIds(s, 0)).toHaveLength(1);
    expect(boardCardIds(s, 1)).toEqual(["BT1-009"]);
  });

  it("uses Counter during the opponent's attack to delete the attacker", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "examon", under: ["BT20-045"] }],
          deck: ["BT1-009"],
          security: ["BT1-009", "BT1-010"],
        },
        1: { battleArea: [{ card: "BT1-024", as: "attacker" }], deck: ["BT1-012"], security: ["BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Suspend", "Blocker"] },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const counter = opened.eligibleCounters.find(
      ({ instanceId }) => instanceId === s.perm("examon").topCard.instanceId,
    );
    expect(counter).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: counter!.instanceId,
        effectKey: counter!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(trashCardIds(s, 0)).toEqual(["BT20-045"]);
    expect(trashCardIds(s, 1)).toEqual(["BT1-024"]);
  });

  it("trashes an opposing battle-area Option when the Option side deletes nothing", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009" }], hand: [{ card: cardId, as: "option" }] },
        1: {
          battleArea: [
            { card: "BT1-084", as: "omnimon" },
            { card: "P-039", as: "opposingOption" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    await useOption(s);
    expect(s.state.memory).toBe(4);
    expect(boardCardIds(s, 1)).toEqual(["BT1-084"]);
    expect(trashCardIds(s, 1)).toEqual(["P-039"]);
  });

  it("keeps the opposing Option when the Option side deletes", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009" }], hand: [{ card: cardId, as: "option" }] },
        1: { battleArea: [{ card: "ST1-10" }, { card: "P-039" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    await useOption(s);
    expect(trashCardIds(s, 1)).toEqual(["ST1-10"]);
    expect(boardCardIds(s, 1)).toEqual(["P-039"]);
  });

  it("Arts Digivolves the used Option onto a red level 6 without a digivolution cost", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST1-10", as: "base" }], hand: [{ card: cardId, as: "option" }], deck: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, declinePrompts: ["Suspend"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(4);
    expect(s.perm("base").stack.map(({ cardId: id }) => id)).toEqual(["ST1-10"]);
  });

  it.each([
    { label: "a green level 5", sources: ["BT3-053"], played: ["BT3-053"] },
    { label: "a blue level 5", sources: ["BT2-027"], played: ["BT2-027"] },
    { label: "a red level 5", sources: ["BT1-024"], played: [] },
    { label: "one card for each Decode", sources: ["BT3-053", "BT2-027"], played: ["BT2-027", "BT3-053"] },
  ])("Decode plays $label", async ({ sources, played }) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: cardId, as: "examon", under: sources }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    advance(s.engine).verb.enterEffectResolution(1 as Seat, ["Digimon"]);
    try {
      await advance(s.engine).verb.returnToHand([s.perm("examon").topCard.instanceId]);
    } finally {
      advance(s.engine).verb.leaveEffectResolution();
    }
    await settle(() => s.state.players[0]!.battleArea.length >= played.length);
    await settle();
    expect(boardCardIds(s, 0).sort()).toEqual(played);
    expect(s.state.players[0]!.hand.map(({ cardId: id }) => id)).toEqual([cardId]);
  });
});
