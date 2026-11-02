import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { assertNoLoudGap, setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "../index.js";

const FILLER = ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"];

const boardCardIds = (s: EngineSetup, seat: 0 | 1): (string | undefined)[] =>
  s.state.players[seat]!.battleArea.map((permanent) => permanent.topCard?.cardId);

describe("BT19-094 Seventh Divine Cruz — catalog and IR", () => {
  it("matches the printed catalog record", () => {
    expect(getCardDefinition("BT19-094")).toMatchObject({
      cardId: "BT19-094",
      nameEn: "Seventh Divine Cruz",
      colors: ["Yellow", "Purple"],
      kinds: ["Option"],
      playCost: 7,
      dp: 0,
      evoCosts: [],
      types: ["Seven Great Demon Lords"],
      maxCountInDeck: 4,
    });
    const printed = getCardDefinition("BT19-094")!;
    expect(printed.effectText).toContain(
      "[Trash] [Your Turn] When any of your Digimon digivolve into [Lucemon (X Antibody)], by returning " +
        "this card to the bottom of the deck, your opponent may trash their top security card. " +
        "If this effect didn't trash, ＜Recovery +1 (Deck)＞",
    );
    expect(printed.effectText).toContain(
      "[Main] Delete your opponent's Digimon until they have as many as the number of your security cards. " +
        "If this effect deleted, ＜Recovery +1 (Deck)＞.",
    );
    expect(printed.securityEffectText).toBe(
      "[Security] You may play 1 [Lucemon] from your trash without paying the cost.",
    );
  });

  it("compiles the three printed clauses to the intended IR shape", () => {
    const card = runtimeCompiledCard("BT19-094");

    expect(card).toMatchObject({ coverage: "full", residual: [] });
    expect(card?.effects).toMatchObject([
      {
        trigger: "YourTurn",
        optional: true,
        isFromTrash: true,
        actions: [
          {
            kind: "SubTrigger",
            optional: true,
            event: "whenOneOfYoursDigivolves",
            sourceFilter: {
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["Lucemon (X Antibody)"], match: "nameExact" }],
            },
            actions: [
              {
                kind: "SecurityManipulation",
                op: "trashTop",
                controller: "opponent",
                optionalFor: "opponent",
                amount: 1,
                bindResultAs: "opponentSecurityTrashedBySeventh",
                cost: {
                  kind: "return",
                  target: {
                    filter: { zone: "trash", controller: "mine", isSelfRef: true },
                    count: 1,
                    isSelf: true,
                  },
                },
              },
              {
                kind: "SecurityManipulation",
                op: "addTop",
                controller: "mine",
                source: "deck",
                amount: 1,
                condition: { kind: "bindingEmpty", ref: "opponentSecurityTrashedBySeventh" },
              },
            ],
          },
        ],
      },
      {
        trigger: "Main",
        actions: [
          {
            kind: "DeleteUntilCount",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
            untilCountSource: "mineSecurityCount",
          },
          {
            kind: "SecurityManipulation",
            op: "addTop",
            controller: "mine",
            source: "deck",
            amount: 1,
            condition: { kind: "ifThisEffectActed" },
          },
        ],
      },
      {
        trigger: "Security",
        isSecurity: true,
        actions: [
          {
            kind: "PlayWithoutCost",
            target: {
              filter: {
                controller: "mine",
                nameOrTrait: [{ tokens: ["Lucemon"], match: "nameExact" }],
              },
              count: 1,
            },
            from: ["trash"],
            payCost: false,
            optional: true,
          },
        ],
      },
    ]);
  });
});

describe("BT19-094 Seventh Divine Cruz — use cost and the multicolour requirement", () => {
  function colourFixture(ownBoard: string[]): EngineSetup {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-094", as: "cruz" }, "BT1-009"],
          battleArea: ownBoard.map((card, index) => ({ card, as: `own${index}` })),
          deck: [...FILLER],
          security: ["BT1-009", "BT1-010"],
        },
        1: { deck: [...FILLER], security: ["BT1-009", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    return s;
  }

  for (const [label, board] of [
    ["an all-blue board", ["BT1-038"]],
    ["a yellow-only board — the purple half is unmet", ["BT1-051", "BT1-038"]],
    ["a purple-only board — the yellow half is unmet", ["BT2-067", "BT1-038"]],
  ] as const) {
    it(`refuses the play off ${label} (CR 4-22-3)`, async () => {
      const s = colourFixture([...board]);
      await s.ready();

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cruz").instanceId })).toEqual({
        ok: false,
        reason: "color-requirement-unmet",
      });
      expect(s.state.memory).toBe(10);
      expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT19-094");
    });
  }

  it("accepts the play off one yellow and one purple permanent, charging the printed 7", async () => {
    const s = colourFixture(["BT1-051", "BT2-067"]);
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cruz").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("cruz").instanceId));
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.security).toHaveLength(2);
    assertNoLoudGap(s);
  });

  it("accepts the play off a SINGLE Purple/Yellow permanent, which meets both halves (CR 4-22-4)", async () => {
    const s = colourFixture(["BT18-082"]);
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cruz").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("cruz").instanceId));
    expect(s.state.memory).toBe(3);
    assertNoLoudGap(s);
  });
});

describe("BT19-094 Seventh Divine Cruz — [Main] delete until the security count", () => {
  function mainFixture(mySecurity: string[], opponentBoard: string[]): EngineSetup {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-094", as: "cruz" }, "BT1-009"],
          battleArea: [
            { card: "BT1-051", as: "colourYellow" },
            { card: "BT2-067", as: "colourPurple" },
          ],
          deck: [{ card: "BT1-013", as: "deckTop" }, ...FILLER],
          security: mySecurity.map((card, index) => ({ card, as: `sec${index}` })),
        },
        1: {
          battleArea: opponentBoard.map((card, index) => ({ card, as: `opp${index}` })),
          deck: [...FILLER],
          security: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    return s;
  }

  it("deletes down to my security count and then performs ＜Recovery +1 (Deck)＞", async () => {
    const s = mainFixture(["BT1-009", "BT1-010"], ["BT1-009", "BT1-010", "BT1-011", "BT1-012"]);
    await s.ready();
    const deckTopId = s.inst("deckTop").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cruz").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 3);

    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.state.players[1]!.trash).toHaveLength(2);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)[0]).toBe(deckTopId);
    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).not.toContain(deckTopId);
    expect(s.state.memory).toBe(3);
    assertNoLoudGap(s);
  });

  it("Q3168: with 0 security cards it deletes every opponent Digimon, then recovers 1", async () => {
    const s = mainFixture([], ["BT1-009", "BT1-010", "BT1-011"]);
    await s.ready();
    const deckTopId = s.inst("deckTop").instanceId;
    expect(s.state.players[0]!.security).toHaveLength(0);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cruz").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(boardCardIds(s, 1)).toEqual([]);
    expect(s.state.players[1]!.trash).toHaveLength(3);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([deckTopId]);
    assertNoLoudGap(s);
  });

  it("deletes nothing — and so recovers nothing — when they already have at most my security count", async () => {
    const s = mainFixture(["BT1-009", "BT1-010", "BT1-011"], ["BT1-009", "BT1-010"]);
    await s.ready();
    const securityBefore = s.state.players[0]!.security.map((card) => card.instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cruz").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("cruz").instanceId));

    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual(securityBefore);
    assertNoLoudGap(s);
  });
});

describe("BT19-094 Seventh Divine Cruz — {Trash} [Your Turn] on digivolution into [Lucemon (X Antibody)]", () => {
  function digivolveFixture(where: "trash" | "hand", opts: { decline?: boolean }): EngineSetup {
    const cruz = { card: "BT19-094", as: "cruz" };
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-111", as: "source" }],
          hand:
            where === "hand" ? [{ card: "BT19-043", as: "lucemonX" }, cruz] : [{ card: "BT19-043", as: "lucemonX" }],
          trash: where === "trash" ? [cruz] : [],
          deck: [{ card: "BT1-012", as: "bonusDraw" }, { card: "BT1-013", as: "deckTop" }, ...FILLER],
          security: ["BT1-009", "BT1-010"],
        },
        1: {
          deck: [...FILLER],
          security: [
            { card: "BT1-009", as: "oppSecTop" },
            { card: "BT1-010", as: "oppSecSecond" },
            { card: "BT1-011", as: "oppSecThird" },
          ],
        },
      },
      opts.decline === true
        ? { autoDeclineOptional: true, autoSelectCards: true }
        : { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    return s;
  }

  const digivolve = (s: EngineSetup): unknown =>
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("source").permanentId,
      instanceId: s.inst("lucemonX").instanceId,
      useAlternateCost: true,
    });

  it("pays the return cost and lets the opponent trash their top security card", async () => {
    const s = digivolveFixture("trash", {});
    await s.ready();
    const cruzId = s.inst("cruz").instanceId;
    const memoryBefore = s.state.memory;

    expect(digivolve(s)).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2);

    expect(memoryBefore - s.state.memory).toBe(3);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(cruzId);
    expect(s.state.players[0]!.deck.at(-1)!.instanceId).toBe(cruzId);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("oppSecSecond").instanceId,
      s.inst("oppSecThird").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("oppSecTop").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(2);
    assertNoLoudGap(s);
  });

  it("does nothing when I decline to activate the optional trash effect", async () => {
    const s = digivolveFixture("trash", { decline: true });
    await s.ready();
    const cruzId = s.inst("cruz").instanceId;

    expect(digivolve(s)).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT19-043"));

    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("oppSecTop").instanceId,
      s.inst("oppSecSecond").instanceId,
      s.inst("oppSecThird").instanceId,
    ]);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.deck.at(-1)!.instanceId).not.toBe(cruzId);
    assertNoLoudGap(s);
  });

  it("Q5551: the same card in HAND does not activate — a {Trash} effect lives only in the trash", async () => {
    const s = digivolveFixture("hand", {});
    await s.ready();
    const cruzId = s.inst("cruz").instanceId;

    expect(digivolve(s)).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT19-043"));

    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(cruzId);
    expect(s.state.players[0]!.deck.at(-1)!.instanceId).not.toBe(cruzId);
    assertNoLoudGap(s);
  });
});

describe("BT19-094 Seventh Divine Cruz — [Security]", () => {
  function securityFixture(trash: string[]): EngineSetup {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-051", as: "attacker" }],
          hand: ["BT1-009"],
          deck: [...FILLER],
          security: ["BT1-009", "BT1-010"],
        },
        1: {
          hand: [],
          trash: trash.map((card, index) => ({ card, as: `trash${index}` })),
          deck: [...FILLER],
          security: [{ card: "BT19-094", as: "flip" }, "BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    return s;
  }

  const attack = (s: EngineSetup): unknown =>
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    });

  it("plays the exact-name [Lucemon] from the trash for free, never the two same-family near misses", async () => {
    const s = securityFixture(["BT19-043", "BT7-111", "BT18-034"]);
    await s.ready();

    expect(attack(s)).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(boardCardIds(s, 1)).toEqual(["BT18-034"]);
    expect(s.state.players[1]!.battleArea[0]!.topCard!.instanceId).toBe(s.inst("trash2").instanceId);
    expect(getCardDefinition("BT18-034")!.playCost).toBe(10);
    expect(s.state.memory).toBeGreaterThan(-10);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT19-043", "BT7-111", "BT19-094"]),
    );
    assertNoLoudGap(s);
  });

  it("plays nothing when the trash holds only [Lucemon (X Antibody)] and [Lucemon: Chaos Mode]", async () => {
    const s = securityFixture(["BT19-043", "BT7-111"]);
    await s.ready();

    expect(attack(s)).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === "BT19-094"));

    expect(boardCardIds(s, 1)).toEqual([]);
    expect(s.state.players[1]!.trash.map((card) => card.cardId).sort()).toEqual(
      ["BT19-043", "BT19-094", "BT7-111"].sort(),
    );
    assertNoLoudGap(s);
  });
});

describe("BT19-094 Seventh Divine Cruz — KB Q&A rulings", () => {
  it("does not recover when ＜Scapegoat＞ saves [Barbamon], because this effect deleted nothing (Q3169)", async () => {
    for (const [chosenAlias, expectedRecovery] of [
      ["barbamon", 0],
      ["other", 1],
    ] as const) {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            hand: [{ card: "BT19-094", as: "cruz" }, "BT1-009"],
            battleArea: [
              { card: "BT1-051", as: "colourYellow" },
              { card: "BT2-067", as: "colourPurple" },
            ],
            deck: [{ card: "BT1-013", as: "deckTop" }, ...FILLER],
            security: ["BT1-009"],
          },
          1: {
            battleArea: [
              { card: "EX6-059", as: "barbamon" },
              { card: "BT1-010", as: "other" },
            ],
            deck: [...FILLER],
            security: ["BT1-009", "BT1-010", "BT1-011"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      preferred.push(s.perm(chosenAlias).permanentId, s.perm(chosenAlias).topCard!.instanceId);
      s.state.memory = 10;
      await s.ready();
      const barbamonId = s.perm("barbamon").permanentId;
      const otherTopId = s.perm("other").topCard!.instanceId;

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cruz").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.battleArea.length === 1);
      await settle(() => s.state.pendingDecision === undefined);

      expect(s.state.players[1]!.battleArea.map((p) => p.permanentId)).toEqual([barbamonId]);
      expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(otherTopId);
      expect(s.state.players[0]!.security).toHaveLength(1 + expectedRecovery);
      expect(s.state.players[0]!.deck.map((card) => card.instanceId).includes(s.inst("deckTop").instanceId)).toBe(
        expectedRecovery === 0,
      );
      assertNoLoudGap(s);
    }
  });

  it("triggers together with another on-digivolve effect, so I choose which resolves first (Q5552)", async () => {
    for (const firstCardId of ["BT19-094", "BT5-091"]) {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT7-111", as: "source" },
              { card: "BT5-091", as: "takumi" },
            ],
            hand: [{ card: "BT19-043", as: "lucemonX" }],
            trash: [{ card: "BT19-094", as: "cruz" }],
            deck: [{ card: "BT1-012", as: "bonusDraw" }, { card: "BT1-013", as: "deckTop" }, ...FILLER],
            security: ["BT1-009", "BT1-010"],
          },
          1: { deck: [...FILLER], security: ["BT1-009", "BT1-010", "BT1-011"] },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          declinePrompts: ["Trash 1 of opponent's top security"],
          preferTriggerKeys: [firstCardId],
        },
      );
      s.state.memory = 10;
      await s.ready();
      const deckTopId = s.inst("deckTop").instanceId;

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("source").permanentId,
          instanceId: s.inst("lucemonX").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.security.length === 3 && s.perm("takumi").isSuspended);
      await settle(() => s.state.pendingDecision === undefined);

      const orderRequest = s.decisions.find(({ req }) => req.kind === "orderTriggers");
      expect(orderRequest?.seat).toBe(0);
      expect([...(orderRequest?.req.options?.triggerCardIds ?? [])].sort()).toEqual(["BT19-094", "BT5-091"]);

      const cruzResolvedFirst = firstCardId === "BT19-094";
      expect(s.state.players[0]!.security[0]!.instanceId === deckTopId).toBe(cruzResolvedFirst);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === deckTopId)).toBe(!cruzResolvedFirst);
      expect(s.state.players[1]!.security).toHaveLength(3);
      expect(s.state.players[0]!.deck.at(-1)!.instanceId).toBe(s.inst("cruz").instanceId);
      assertNoLoudGap(s);
    }
  });
});
