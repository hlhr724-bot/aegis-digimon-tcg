import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "../index.js";
import { compiled } from "./EX13-035.js";

const cardId = "EX13-035";

const CHUUMON_3 = "BT3-061";
const SUKAMON_3 = "BT14-034";
const KING_SUKAMON_6 = "BT13-069";
const ETEMON_7 = "BT3-070";
const PLATINUM_SUKAMON_LV4 = "BT13-065";
const TEXT_ONLY_SUKAMON = "BT11-063";
const UNNAMED_LV5 = "BT1-057";
const ETEMON_BLOCKER = "BT3-070";
const OPPONENT_SUKAMON_3000 = "EX9-049";

const SENTINEL = "BT1-009";
const OPPONENT_TARGET = "BT1-010";
const OPPONENT_OTHER = "BT1-011";

const nameUnion = (tokens: string[]) => [{ tokens, match: "name" }];

describe("EX13-035 KingEtemon", () => {
  it("matches the catalog printed text, stats and dual evolution costs", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      nameEn: "KingEtemon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 13,
      dp: 13000,
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Puppet"],
      evoCosts: [
        { color: "Yellow", level: 5, memoryCost: 5 },
        { color: "Black", level: 5, memoryCost: 5 },
      ],
    });
    expect(getCardDefinition(cardId)!.effectText).toBe(
      "[Digivolve] Lv.5 w/[Sukamon]/[Etemon] in name: Cost 4 \n\n" +
        "[On Play] [When Digivolving] You may play up to 2 Digimon cards with [Chuumon], [Sukamon] or [Etemon] in their names and up to 6 total play cost from your hand or trash without paying the costs. By returning 10 such cards from your trash to the bottom of the deck, add 6 to the play cost maximum.\n" +
        "[All Turns] While there are 3 or more Digimon with [Sukamon] or [Etemon] in their names, give all of your opponent's Digimon ＜Security A. -1＞ and -3000 DP.",
    );
    expect(getCardDefinition(cardId)!.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition(cardId)!.securityEffectText).toBeUndefined();
    expect(compiled.effects.some((effect) => effect.isInherited === true)).toBe(false);
    expect(compiled.effects.some((effect) => effect.isSecurity === true)).toBe(false);
  });

  it("compiles the alternate digivolve header as a substring-name Lv.5 route", () => {
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 5, names: ["Sukamon", "Etemon"], cost: 4, isAlternate: true },
    ]);
  });

  it("compiles the play clause under both printed timings as one exclusive-branch modal", () => {
    expect(runtimeCompiledCard(cardId)).toMatchObject({
      coverage: "full",
      residual: [],
    });

    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      const effect = compiled.effects.find((candidate) => candidate.trigger === trigger)!;
      expect(effect.isInherited).toBeUndefined();
      expect(effect.frequency).toBeUndefined();
      const modal = effect.actions[0]!;
      expect(modal).toMatchObject({ kind: "Modal", choose: 1, optional: true });
      expect((modal as { optionConditions?: unknown }).optionConditions).toBeUndefined();
      if (modal.kind !== "Modal") throw new Error("expected the play clause to compile to a Modal");
      expect(modal.options[0]).toEqual([
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: nameUnion(["Chuumon", "Sukamon", "Etemon"]),
              playCostLte: 6,
            },
            count: 2,
            upTo: true,
            totalPlayCostBudget: 6,
          },
          from: ["hand", "trash"],
          payCost: false,
          raw: expect.any(String),
        },
      ]);
      expect(modal.options[1]![0]).toMatchObject({
        kind: "PlayWithoutCost",
        target: { filter: { playCostLte: 12 }, count: 2, upTo: true, totalPlayCostBudget: 12 },
        from: ["hand", "trash"],
        payCost: false,
        cost: {
          kind: "return",
          to: "deckBottom",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              nameOrTrait: nameUnion(["Chuumon", "Sukamon", "Etemon"]),
            },
            count: 10,
          },
        },
      });
    }
  });

  it("compiles the conditional debuff as two continuously gated board-wide auras", () => {
    const effect = compiled.effects.find((candidate) => candidate.trigger === "AllTurns")!;
    const gate = {
      kind: "anyHas",
      filter: { zone: "battleArea", kind: ["Digimon"], nameOrTrait: nameUnion(["Sukamon", "Etemon"]) },
      countMin: 3,
      raw: expect.any(String),
    };
    expect(effect.actions).toEqual([
      {
        kind: "Aura",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
        effect: { kind: "keyword", keyword: { keyword: "SecurityAttack", amount: -1, raw: "＜Security A. -1＞" } },
        while: gate,
        raw: expect.any(String),
      },
      {
        kind: "Aura",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
        effect: { kind: "modifyDP", amount: -3000 },
        while: gate,
        raw: expect.any(String),
      },
    ]);
  });

  it("plays one named card from hand and one from the trash, refusing the over-cost and text-only cards", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: cardId, as: "king" },
            { card: SUKAMON_3, as: "fromHand" },
          ],
          trash: [
            { card: CHUUMON_3, as: "fromTrash" },
            { card: ETEMON_7, as: "overCost" },
            { card: TEXT_ONLY_SUKAMON, as: "textOnly" },
            { card: SENTINEL, as: "unnamed" },
          ],
          deck: [SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    preferred.push(s.inst("overCost").instanceId, s.inst("textOnly").instanceId, s.inst("unnamed").instanceId);
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(
      [cardId, SUKAMON_3, CHUUMON_3].sort(),
    );
    expect(s.state.memory).toBe(-3);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("overCost").instanceId,
      s.inst("textOnly").instanceId,
      s.inst("unnamed").instanceId,
    ]);
    assertNoLoudGap(s);
  });

  it("plays nothing when the controller declines the printed 'You may'", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "king" }],
          trash: [{ card: CHUUMON_3, as: "candidate" }],
          deck: [SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([cardId]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("candidate").instanceId]);
    assertNoLoudGap(s);
  });

  it.each([CHUUMON_3, "BT14-097"])(
    "returns ten named cards including %s before playing with the raised maximum",
    async (lastFodder) => {
      const s = setupEngine(
        {
          0: {
            hand: [
              { card: cardId, as: "king" },
              { card: ETEMON_7, as: "overBaseCost" },
            ],
            trash: Array.from({ length: 10 }, (_, n) => ({ card: n === 9 ? lastFodder : CHUUMON_3, as: `fodder${n}` })),
            deck: [{ card: SENTINEL, as: "deckTop" }],
            security: [SENTINEL],
          },
          1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 1 },
      );
      s.state.memory = 10;
      await s.ready();
      const fodderIds = Array.from({ length: 10 }, (_, n) => s.inst(`fodder${n}`).instanceId);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.battleArea.length === 2);
      await settle(() => s.state.pendingDecision === undefined);

      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(
        [cardId, ETEMON_7].sort(),
      );
      expect(s.state.memory).toBe(-3);
      expect(s.state.players[0]!.trash).toHaveLength(0);
      const deck = s.state.players[0]!.deck.map(({ instanceId }) => instanceId);
      expect(deck[0]).toBe(s.inst("deckTop").instanceId);
      expect(deck.slice(1).sort()).toEqual([...fodderIds].sort());
      assertNoLoudGap(s);
    },
  );

  it("Q7316: never offers the raised maximum with only nine such cards in the trash", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: cardId, as: "king" },
            { card: ETEMON_7, as: "overBaseCost" },
          ],
          trash: Array.from({ length: 9 }, (_, n) => ({ card: CHUUMON_3, as: `fodder${n}` })),
          deck: [{ card: SENTINEL, as: "deckTop" }],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 1 },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("overBaseCost").instanceId]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(
      [cardId, CHUUMON_3, CHUUMON_3].sort(),
    );
    expect(s.state.players[0]!.trash).toHaveLength(7);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([s.inst("deckTop").instanceId]);
    assertNoLoudGap(s);
  });

  it("caps the combined play cost of the cards it plays at the printed maximum", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "king" }],
          trash: [
            { card: KING_SUKAMON_6, as: "six" },
            { card: CHUUMON_3, as: "three" },
          ],
          deck: [SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length >= 2);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[0]!.trash).toHaveLength(1);
  });

  it.each(
    [
      { first: KING_SUKAMON_6, second: CHUUMON_3, selection: ["first", "second"], played: ["first"] },
      { first: CHUUMON_3, second: KING_SUKAMON_6, selection: ["first", "second"], played: ["first"] },
      { first: CHUUMON_3, second: SUKAMON_3, selection: ["first", "second"], played: ["first", "second"] },
      { first: KING_SUKAMON_6, second: CHUUMON_3, selection: [], played: [] },
    ].flatMap((testCase) => (["OnPlay", "WhenDigivolving"] as const).map((trigger) => ({ ...testCase, trigger }))),
  )(
    "enforces the base aggregate budget at $trigger for $first + $second with selection $selection",
    async ({ first, second, selection, played, trigger }) => {
      const s = setupEngine(
        {
          0: {
            ...(trigger === "WhenDigivolving" ? { battleArea: [{ card: ETEMON_7, as: "base" }] } : {}),
            hand: [
              { card: cardId, as: "king" },
              { card: first, as: "first" },
            ],
            trash: [{ card: second, as: "second" }],
            deck: ["BT1-028", "BT1-028"],
            security: [SENTINEL],
          },
          1: { deck: ["BT7-032", "BT7-032"], security: [SENTINEL] },
        },
        { autoAcceptOptional: true, autoChooseOption: true, autoOrderTriggers: true },
      );
      s.state.memory = 10;
      await s.ready();
      const ids = new Map(["first", "second"].map((alias) => [alias, s.inst(alias).instanceId]));
      expect(
        s.engine.applyIntent(
          0,
          trigger === "OnPlay"
            ? { type: "playCard", instanceId: s.inst("king").instanceId }
            : {
                type: "digivolve",
                permanentId: s.perm("base").permanentId,
                instanceId: s.inst("king").instanceId,
                useAlternateCost: true,
              },
        ),
      ).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const decision = s.state.pendingDecision!;
      const payload = JSON.parse(decision.payloadJson);
      expect(decision.seat).toBe(0);
      expect(payload.maxTotalPlayCost).toBe(6);
      expect(payload.min).toBe(0);
      expect(payload.max).toBe(2);
      expect(new Set(payload.candidateInstanceIds)).toEqual(new Set(ids.values()));
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "selectCards", instanceIds: selection.map((alias) => ids.get(alias)!) },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined);
      expect(s.state.players[0]!.battleArea.map((p) => p.topCard.instanceId).sort()).toEqual(
        [s.inst("king").instanceId, ...played.map((alias) => ids.get(alias)!)].sort(),
      );
      expect(s.state.players[0]!.hand.filter((c) => c.cardId !== "BT1-028").map((c) => c.instanceId)).toEqual(
        played.includes("first") ? [] : [ids.get("first")!],
      );
      expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toEqual(
        played.includes("second") ? [] : [ids.get("second")!],
      );
      expect(s.state.players[0]!.deck).toHaveLength(trigger === "OnPlay" ? 2 : 1);
      expect(s.state.players[0]!.security).toHaveLength(1);
      expect(s.state.memory).toBe(trigger === "OnPlay" ? -3 : 6);
      expect(s.state.players[0]!.hand.filter((c) => c.cardId === "BT1-028")).toHaveLength(trigger === "OnPlay" ? 0 : 1);
      const king = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("king").instanceId)!;
      expect(king.stack.map((c) => c.instanceId)).toEqual(trigger === "OnPlay" ? [] : [s.inst("base").instanceId]);
      assertNoLoudGap(s);
    },
  );

  it.each(
    [
      { first: KING_SUKAMON_6, second: KING_SUKAMON_6, played: ["first", "second"] },
      { first: ETEMON_7, second: KING_SUKAMON_6, played: ["first"] },
      { first: KING_SUKAMON_6, second: ETEMON_7, played: ["first"] },
    ].flatMap((testCase) => (["OnPlay", "WhenDigivolving"] as const).map((trigger) => ({ ...testCase, trigger }))),
  )(
    "enforces the paid aggregate budget at $trigger for $first + $second",
    async ({ first, second, played, trigger }) => {
      const fodderCards = [
        CHUUMON_3,
        CHUUMON_3,
        CHUUMON_3,
        CHUUMON_3,
        SUKAMON_3,
        SUKAMON_3,
        SUKAMON_3,
        SUKAMON_3,
        PLATINUM_SUKAMON_LV4,
        PLATINUM_SUKAMON_LV4,
      ];
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            ...(trigger === "WhenDigivolving" ? { battleArea: [{ card: ETEMON_7, as: "base" }] } : {}),
            hand: [
              { card: cardId, as: "king" },
              { card: first, as: "first" },
              { card: second, as: "second" },
            ],
            trash: fodderCards.map((card, n) => ({ card, as: `paid${n}` })),
            deck: [
              ...(trigger === "WhenDigivolving" ? [{ card: "BT1-028", as: "bonusDraw" }] : []),
              { card: "BT1-028", as: "deckTop" },
            ],
            security: [SENTINEL],
          },
          1: { deck: ["BT7-032", "BT7-032"], security: [SENTINEL] },
        },
        {
          autoAcceptOptional: true,
          autoChooseOption: true,
          preferOptionIndex: 1,
          autoSelectCards: true,
          preferInstanceIds: preferred,
          autoOrderTriggers: true,
        },
      );
      const firstId = s.inst("first").instanceId;
      const secondId = s.inst("second").instanceId;
      const paidIds = fodderCards.map((_, n) => s.inst(`paid${n}`).instanceId);
      preferred.push(...paidIds, firstId, secondId);
      s.state.memory = 10;
      await s.ready();
      expect(
        s.engine.applyIntent(
          0,
          trigger === "OnPlay"
            ? { type: "playCard", instanceId: s.inst("king").instanceId }
            : {
                type: "digivolve",
                permanentId: s.perm("base").permanentId,
                instanceId: s.inst("king").instanceId,
                useAlternateCost: true,
              },
        ),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.battleArea.length >= 2 && s.state.pendingDecision === undefined);
      const budgetDecision = s.decisions.find(
        ({ req }) => req.kind === "selectCards" && req.options?.maxTotalPlayCost === 12,
      )?.req;
      expect(budgetDecision).toBeDefined();
      expect(new Set(budgetDecision!.options?.candidateInstanceIds)).toEqual(new Set([firstId, secondId]));
      expect(budgetDecision!.options?.max).toBe(2);
      const playedIds = played.map((alias) => s.inst(alias).instanceId);
      expect(s.state.players[0]!.battleArea.map((p) => p.topCard.instanceId).sort()).toEqual(
        [s.inst("king").instanceId, ...playedIds].sort(),
      );
      expect(s.state.players[0]!.hand.filter((c) => c.cardId !== "BT1-028").map((c) => c.instanceId)).toEqual(
        [firstId, secondId].filter((id) => !playedIds.includes(id)),
      );
      expect(s.state.players[0]!.trash).toHaveLength(0);
      const finalDeck = s.state.players[0]!.deck.map((c) => c.instanceId);
      expect(finalDeck[0]).toBe(s.inst("deckTop").instanceId);
      expect(finalDeck.slice(1).sort()).toEqual([...paidIds].sort());
      expect(s.state.memory).toBe(trigger === "OnPlay" ? -3 : 6);
      expect(s.state.players[0]!.security).toHaveLength(1);
      expect(s.state.players[0]!.hand.filter((c) => c.cardId === "BT1-028")).toHaveLength(trigger === "OnPlay" ? 0 : 1);
      const king = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("king").instanceId)!;
      expect(king.stack.map((c) => c.instanceId)).toEqual(trigger === "OnPlay" ? [] : [s.inst("base").instanceId]);
      assertNoLoudGap(s);
    },
  );

  it("digivolves from a Lv.5 Etemon for 4, keeps the source in the stack and fires the same clause", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ETEMON_7, as: "base" }],
          hand: [{ card: cardId, as: "king" }],
          trash: [{ card: SUKAMON_3, as: "fromTrash" }],
          deck: [{ card: SENTINEL, as: "bonusDraw" }, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("king").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(6);
    expect(s.perm("base").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("base").instanceId]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("bonusDraw").instanceId]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(
      [cardId, SUKAMON_3].sort(),
    );
    expect(s.state.players[0]!.trash).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("charges the printed 5 when the Lv.5 source carries neither name token", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: UNNAMED_LV5, as: "base" }],
          hand: [{ card: cardId, as: "king" }],
          deck: [SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("king").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(5);
  });

  it("refuses a Lv.4 source even when its name carries [Sukamon]", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: PLATINUM_SUKAMON_LV4, as: "base" }],
        hand: [{ card: cardId, as: "king" }],
        deck: [SENTINEL, SENTINEL],
        security: [SENTINEL],
      },
      1: { deck: [SENTINEL, SENTINEL], security: [SENTINEL] },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("king").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("base").topCard.cardId).toBe(PLATINUM_SUKAMON_LV4);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("king").instanceId]);
    expect(s.state.memory).toBe(10);
  });

  it("Q7317: counts named Digimon on both players' battle areas for the board-wide opposing debuff", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: cardId, as: "king" },
          { card: SUKAMON_3, as: "mySukamon" },
        ],
        deck: [SENTINEL, SENTINEL],
        security: [SENTINEL],
      },
      1: {
        battleArea: [
          { card: ETEMON_7, as: "theirEtemon", dp: 6000 },
          { card: OPPONENT_TARGET, as: "target", dp: 9000 },
        ],
        deck: [SENTINEL, SENTINEL],
        security: [SENTINEL],
      },
    });
    await s.ready();
    await s.engine.recomputeContinuousEffects();

    for (const alias of ["theirEtemon", "target"]) {
      expect(observe(s.engine).keywordAmount(s.perm(alias), "SecurityAttack")).toBe(-1);
    }
    expect(s.perm("target").currentDP).toBe(6000);
    expect(s.perm("theirEtemon").currentDP).toBe(3000);
    expect(observe(s.engine).keywordAmount(s.perm("mySukamon"), "SecurityAttack")).toBe(0);
    expect(s.perm("mySukamon").currentDP).toBe(getCardDefinition(SUKAMON_3)!.dp);
    expect(s.perm("king").currentDP).toBe(13000);

    await advance(s.engine).verb.deletePermanent([s.perm("theirEtemon").permanentId]);
    await s.engine.recomputeContinuousEffects();

    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(0);
    expect(s.perm("target").currentDP).toBe(9000);
  });

  it("counts an opposing Digimon rewritten to [Sukamon] and deletes it at 0 DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "kingEtemon" }],
          hand: [
            { card: "EX13-031", as: "kingSukamon" },
            { card: CHUUMON_3, as: "fee" },
          ],
          deck: [SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: {
          battleArea: [
            { card: OPPONENT_TARGET, as: "rewritten", dp: 9000 },
            { card: OPPONENT_OTHER, as: "target", dp: 9000 },
          ],
          deck: [SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kingSukamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).effectiveNames(s.perm("rewritten")).includes("sukamon"));
    await settle(() => s.state.pendingDecision === undefined);
    await s.engine.recomputeContinuousEffects();
    await settle(() =>
      s.state.players[1]!.trash.some(({ instanceId }) => instanceId === s.inst("rewritten").instanceId),
    );

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
      s.inst("target").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("rewritten").instanceId);
    assertNoLoudGap(s);
  });

  it("does not count a Digimon that carries [Sukamon] only in its text", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: cardId, as: "king" },
          { card: SUKAMON_3, as: "mySukamon" },
          { card: TEXT_ONLY_SUKAMON, as: "nearMatch" },
        ],
        deck: [SENTINEL, SENTINEL],
        security: [SENTINEL],
      },
      1: {
        battleArea: [{ card: OPPONENT_OTHER, as: "target", dp: 9000 }],
        deck: [SENTINEL, SENTINEL],
        security: [SENTINEL],
      },
    });
    await s.ready();
    await s.engine.recomputeContinuousEffects();

    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(0);
    expect(s.perm("target").currentDP).toBe(9000);

    s.putOnBoard(0, { card: PLATINUM_SUKAMON_LV4, as: "realThird" });
    await s.engine.recomputeContinuousEffects();

    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(-1);
    expect(s.perm("target").currentDP).toBe(6000);
  });

  it("ignores a breeding-area named Digimon when counting to three", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: cardId, as: "king" },
          { card: SUKAMON_3, as: "mySukamon" },
        ],
        breeding: { card: PLATINUM_SUKAMON_LV4, as: "breedingSukamon" },
        deck: [SENTINEL, SENTINEL],
        security: [SENTINEL],
      },
      1: {
        battleArea: [{ card: OPPONENT_TARGET, as: "target", dp: 9000 }],
        deck: [SENTINEL, SENTINEL],
        security: [SENTINEL],
      },
    });
    await s.ready();
    await s.engine.recomputeContinuousEffects();

    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(0);
    expect(s.perm("target").currentDP).toBe(9000);
  });
  it("Discord 1557158483273453598: orders KingSukamon's inherited watcher with [When Digivolving] after the aura deletes a Sukamon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-031", as: "kingSukamon" },
            { card: ETEMON_BLOCKER, as: "myEtemon" },
          ],
          hand: [{ card: cardId, as: "king" }],
          deck: [SENTINEL, SENTINEL, SENTINEL, SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: {
          battleArea: [{ card: OPPONENT_SUKAMON_3000, as: "theirSukamon" }],
          deck: [SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
      },
      { autoDeclineOptional: true, autoOrderTriggers: false },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("kingSukamon").permanentId,
        instanceId: s.inst("king").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("theirSukamon").instanceId]);
    const order = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect(order.options?.triggerCardIds).toEqual(expect.arrayContaining([cardId, "EX13-031"]));
    expect(order.options?.triggerKeys).toHaveLength(2);
    const resolvedBeforeOrder = s.events.filter(
      (event) => event.kind === "effectTriggered" && [cardId, "EX13-031"].includes(event.sourceCardId ?? ""),
    );
    expect(resolvedBeforeOrder).toEqual([]);
    expect(s.state.players[0]!.deck).toHaveLength(5);

    const watcherKey = order.options!.triggerKeys![order.options!.triggerCardIds!.indexOf("EX13-031")]!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: { kind: "orderTriggers", order: [watcherKey] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    const triggeredCardIds = s.events.flatMap((event) =>
      event.kind === "effectTriggered" && [cardId, "EX13-031"].includes(event.sourceCardId ?? "")
        ? [event.sourceCardId]
        : [],
    );
    expect(triggeredCardIds).toEqual(["EX13-031"]);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.trash).toHaveLength(3);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    assertNoLoudGap(s);
  });
});
