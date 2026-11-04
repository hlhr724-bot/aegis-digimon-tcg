import {
  compiledEffects,
  digivolutionRequirementsFor,
  getCardDefinition,
  Phase,
  type CardDefinition,
} from "@aegis/shared";
import { afterEach, describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { registerIrCard, runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { registeredCompiledCards, registeredIrModules } from "../../engine/effects/interpreter/compiledCards.js";
import { unregisterCard } from "../../engine/effects/registry.js";
import { syntheticDefinitions } from "../../engine/testkit/syntheticDefinitions.js";
import "../index.js";
import "./EX13-065.js";
import { compiled } from "./EX13-065.js";

afterEach(() => {
  for (const id of syntheticDefinitions.keys()) {
    unregisterCard(id);
    delete compiledEffects[id];
    registeredCompiledCards.delete(id);
    registeredIrModules.delete(id);
  }
  syntheticDefinitions.clear();
});

const cardId = "EX13-065";

const SENTINEL = "BT1-009";
const NEUTRAL_LV3 = "BT1-013";
const NEUTRAL_LV4 = "BT1-014";
const BIG_VANILLA = "BT1-080";

const BLANC = "BT6-082";
const BLANC_REPRINT = "ST12-12";
const BLANC_AWAKENED_OLD = "BT7-082";
const CIEL_COST_6 = "BT7-083";
const HUCKMON_TEXT_ONLY = "BT13-009";
const WHITE_SOURCE = BLANC_AWAKENED_OLD;
const CIEL_COST_4 = "BT10-085";

const EGG_NO_HUCKMON = "BT22-004";

const inertDeck = [SENTINEL, SENTINEL, SENTINEL, SENTINEL, SENTINEL];

describe("EX13-065 Sistermon Blanc (Awakened) / Divine Pierce (Awakened)", () => {
  it("matches the catalog printed text, stats and dual-card record", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "EX13",
      nameEn: "Sistermon Blanc (Awakened)",
      colors: ["White", "Yellow"],
      kinds: ["Digimon", "Option"],
      level: 3,
      playCost: 5,
      dp: 5000,
      forms: ["Rookie"],
      attributes: ["Vaccine"],
      types: ["Puppet"],
      evoCosts: [],
      isDualCard: true,
      dualEffect: "Divine Pierce (Awakened)",
      optionColorRequirements: ["White"],
      effectText:
        "[Digivolve] [Sistermon Blanc]: Cost 0 [Digivolve] Lv.2 w/[Huckmon] in text: Cost 1 \n\n＜Decode ([Sistermon Blanc])＞ \n＜Guard＞ ",
      optionEffect:
        "[Main] You may play 1 play cost 4 or lower card with [Sistermon] from your hand or trash without paying the cost. Then, to 1 of your opponent's Digimon, give -3000 DP for the turn for each of your Digimon.",
    });
    expect(getCardDefinition(cardId)?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition(cardId)?.securityEffectText).toBeUndefined();
  });

  it("compiles every printed clause and nothing else", () => {
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toHaveLength(4);
    expect(compiled.effects.some(({ isSecurity }) => isSecurity)).toBe(false);
    expect(compiled.effects.some(({ isInherited }) => isInherited === true)).toBe(false);

    expect(compiled.effects[0]).toEqual({
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Decode", raw: "＜Decode ([Sistermon Blanc])＞" }],
    });
    expect(compiled.effects[1]).toEqual({
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Guard", raw: "＜Guard＞" }],
    });

    const decode = compiled.effects[2]!;
    expect(decode).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanBattle",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  hostFilter: { isSelfRef: true },
                  nameOrTrait: [{ tokens: ["Sistermon Blanc"], match: "nameExact" }],
                },
                count: 1,
              },
              from: ["digivolutionCards"],
              payCost: false,
              playedByDecode: true,
              optional: true,
            },
          ],
        },
      ],
    });
    expect(decode.actions[0]).not.toHaveProperty("mode");
    expect(decode.frequency).toBeUndefined();

    expect(
      compiled.effects.filter((effect) => effect.actions.some((action) => action.kind === "Replacement")),
    ).toHaveLength(1);

    const main = compiled.effects[3]!;
    expect(main.trigger).toBe("Main");
    expect(main.actions).toMatchObject([
      {
        kind: "PlayWithoutCost",
        target: {
          filter: {
            controller: "mine",
            playCostLte: 4,
            nameOrTrait: [{ tokens: ["Sistermon"], match: "name" }],
          },
          count: 1,
        },
        from: ["hand", "trash"],
        payCost: false,
        optional: true,
      },
      {
        kind: "ModifyDP",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        amount: -3000,
        duration: "forTheTurn",
        scaling: { per: 1, unit: "cards", filter: { controllerDefault: "mine", kind: ["Digimon"] } },
      },
    ]);
    expect((main.actions[0] as { target: { filter: { kind?: unknown } } }).target.filter.kind).toBeUndefined();
    expect(main.actions[0]).not.toHaveProperty("abortOnDecline");
  });

  it("publishes exactly the two printed [Digivolve] routes and no catalog EvoCost", () => {
    expect(digivolutionRequirementsFor(cardId)).toEqual([
      { namesExact: ["Sistermon Blanc"], cost: 0, isAlternate: true },
      { level: 2, texts: ["Huckmon"], cost: 1, isAlternate: true },
    ]);
    expect(getCardDefinition(cardId)?.evoCosts).toEqual([]);
  });

  it.each([
    ["the original printing", BLANC],
    ["a second printing of the same name", BLANC_REPRINT],
  ])("digivolves off %s for 0 memory, keeping the source under it and drawing 1", async (_label, sourceCardId) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: sourceCardId, as: "base" }],
        hand: [{ card: cardId, as: "awakened" }],
        deck: inertDeck,
        security: [SENTINEL],
      },
      1: { deck: inertDeck, security: [SENTINEL] },
    });
    s.state.memory = 0;
    await s.ready();
    const baseInstanceId = s.inst("base").instanceId;
    const basePermanentId = s.perm("base").permanentId;
    const handBefore = s.state.players[0]!.hand.length;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: basePermanentId,
        instanceId: s.inst("awakened").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId);
    await settle();

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand).toHaveLength(handBefore);
    expect(s.perm("base").permanentId).toBe(basePermanentId);
    expect(s.perm("base").stack.map(({ instanceId }) => instanceId)).toEqual([baseInstanceId]);
    expect(s.perm("base").stack.map(({ cardId: id }) => id)).toEqual([sourceCardId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("refuses a source whose name merely CONTAINS [Sistermon Blanc], and a non-Sistermon Lv.3", () => {
    for (const [baseCardId, useAlternateCost] of [
      [BLANC_AWAKENED_OLD, true],
      [BLANC_AWAKENED_OLD, false],
      [NEUTRAL_LV3, true],
      [NEUTRAL_LV3, false],
      [BLANC_AWAKENED_OLD, undefined],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: baseCardId, as: "base" }],
          hand: [{ card: cardId, as: "awakened" }],
          deck: inertDeck,
        },
      });
      s.state.memory = 5;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("awakened").instanceId,
          ...(useAlternateCost === undefined ? {} : { useAlternateCost }),
        }),
      ).toEqual(expect.objectContaining({ ok: false }));
      expect(s.state.memory).toBe(5);
      expect(s.perm("base").topCard.cardId).toBe(baseCardId);
      expect(s.state.players[0]!.hand).toHaveLength(1);
    }
  });

  it.each(["nameEn", "effectText", "inheritedEffectText"] as const)(
    "takes the cost-one Lv.2 route with synthetic printed %s",
    async (field) => {
      const eggId = `TEST-EX13-065-${field}`;
      const referenceText = getCardDefinition("ST12-04")!.inheritedEffectText!;
      const inheritedAura = runtimeCompiledCard("ST12-04")!.effects.find((effect) => effect.isInherited)!;
      const egg: CardDefinition = {
        ...getCardDefinition(EGG_NO_HUCKMON)!,
        cardId: eggId,
        nameEn: "Synthetic Text Egg",
        effectText: undefined,
        inheritedEffectText: undefined,
        [field]: field === "nameEn" ? "Huckmon Test Egg" : referenceText,
      };
      syntheticDefinitions.set(eggId, egg);
      registerIrCard(eggId, {
        effects: field === "nameEn" ? [] : [{ ...inheritedAura, isInherited: field === "inheritedEffectText" }],
        coverage: "full",
        residual: [],
      });
      const s = setupEngine({
        0: {
          eggDeck: [{ card: eggId, as: "egg" }],
          hand: [{ card: cardId, as: "awakened" }],
          deck: [{ card: NEUTRAL_LV3, as: "evolutionDraw" }, ...inertDeck],
        },
        1: { security: [SENTINEL], deck: inertDeck },
      });
      s.state.memory = 5;
      await s.ready();
      const turn = s.engine.runOneTurn();
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      try {
        const memoryBefore = s.state.memory;
        expect(s.perm("egg").topCard.cardId).toBe(eggId);
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("egg").permanentId,
            instanceId: s.inst("awakened").instanceId,
            useAlternateCost: true,
          }),
        ).toEqual({ ok: true });
        await settle(
          () =>
            s.perm("egg").topCard.cardId === cardId &&
            s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("evolutionDraw").instanceId),
        );
        expect(s.state.memory).toBe(memoryBefore - 1);
        expect(s.perm("egg").stack.map((card) => card.cardId)).toEqual([eggId]);
        expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("evolutionDraw").instanceId]);
        expect(s.state.players[0]!.breeding?.permanentId).toBe(s.perm("egg").permanentId);
        expect(s.state.players[0]!.battleArea).toHaveLength(0);
        assertNoLoudGap(s);
      } finally {
        advance(s.engine).endMainPhaseIfOpen(0);
        await turn;
      }
    },
  );

  it("rejects real Lv.3 Huckmon printed text without paying or moving cards", () => {
    const sourceId = "ST12-04";
    const s = setupEngine({
      0: { battleArea: [{ card: sourceId, as: "base" }], hand: [{ card: cardId, as: "awakened" }], deck: inertDeck },
    });
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("awakened").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").topCard.cardId).toBe(sourceId);
    expect(s.perm("base").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([cardId]);
  });

  it("refuses a Lv.2 source with no [Huckmon] in its text", () => {
    const s = setupEngine({
      0: { breeding: { card: EGG_NO_HUCKMON, as: "egg" }, hand: [{ card: cardId, as: "awakened" }], deck: inertDeck },
    });
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("awakened").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.state.memory).toBe(5);
    expect(s.perm("egg").topCard.cardId).toBe(EGG_NO_HUCKMON);
  });

  it("exposes the printed ＜Decode＞ and ＜Guard＞ keywords on the continuous ledger", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "awakened" }], deck: inertDeck } });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("awakened"), "Decode")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("awakened"), "Guard")).toBe(true);
  });

  it("plays the [Sistermon Blanc] out of its own stack when an effect makes it leave", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "awakened", under: [{ card: BLANC, as: "blanc" }] }],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const blancId = s.inst("blanc").instanceId;
    const awakenedPermanentId = s.perm("awakened").permanentId;
    const deckBefore = s.state.players[0]!.deck.length;

    expect(await advance(s.engine).verb.deletePermanent([awakenedPermanentId], "byEffect")).toBe(1);
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === blancId));
    await settle();

    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === awakenedPermanentId)).toBe(false);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([cardId]);
    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.instanceId === blancId)!;
    expect(played.topCard!.cardId).toBe(BLANC);
    expect(played.stack).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(deckBefore - 1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not fire ＜Decode＞ when the host leaves by battle", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "awakened", under: [{ card: BLANC, as: "blanc" }] }],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const blancId = s.inst("blanc").instanceId;

    expect(await advance(s.engine).verb.deletePermanent([s.perm("awakened").permanentId], "byBattle")).toBe(1);
    await settle();

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(blancId);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id).sort()).toEqual([BLANC, cardId].sort());
  });

  it("refuses a stacked [Sistermon Blanc (Awakened)] — the printed name gate is EXACT", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "awakened", under: [{ card: BLANC_AWAKENED_OLD, as: "notBlanc" }] }],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const notBlancId = s.inst("notBlanc").instanceId;

    expect(await advance(s.engine).verb.deletePermanent([s.perm("awakened").permanentId], "byEffect")).toBe(1);
    await settle();

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(notBlancId);
  });

  it("plays only from its own digivolution cards, never from a neighbour's stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "awakened" },
            { card: NEUTRAL_LV4, as: "neighbour", under: [{ card: BLANC, as: "foreign" }] },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const foreignId = s.inst("foreign").instanceId;

    expect(await advance(s.engine).verb.deletePermanent([s.perm("awakened").permanentId], "byEffect")).toBe(1);
    await settle();

    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === foreignId)).toBe(false);
    expect(s.perm("neighbour").stack.map(({ instanceId }) => instanceId)).toEqual([foreignId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("saves another of your Digimon from an opponent's effect by deleting itself", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "awakened" },
            { card: NEUTRAL_LV4, as: "ally" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const allyId = s.perm("ally").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.players[0]!.trash.length === 1);
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([allyId]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([cardId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("saves every matching Digimon in one leave event for a single payment", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "awakened" },
            { card: NEUTRAL_LV4, as: "allyA" },
            { card: NEUTRAL_LV3, as: "allyB" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const allyA = s.perm("allyA").permanentId;
    const allyB = s.perm("allyB").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyA, allyB], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.players[0]!.trash.length === 1);
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId).sort()).toEqual([allyA, allyB].sort());
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([cardId]);
  });

  it("does not offer ＜Guard＞ against the controller's own effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "awakened" },
            { card: NEUTRAL_LV4, as: "ally" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    advance(s.engine).verb.enterEffectResolution(0, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([s.perm("ally").permanentId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual([cardId]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([NEUTRAL_LV4]);
  });

  it("does not save itself — ＜Guard＞ protects OTHER Digimon only", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "awakened" },
            { card: NEUTRAL_LV4, as: "ally" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const allyId = s.perm("ally").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([s.perm("awakened").permanentId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([allyId]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([cardId]);
  });

  it("chains ＜Guard＞ into ＜Decode＞: the self-delete is a leave other than in battle", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "awakened", under: [{ card: BLANC, as: "blanc" }] },
            { card: NEUTRAL_LV4, as: "ally" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    const allyId = s.perm("ally").permanentId;
    const blancId = s.inst("blanc").instanceId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === blancId));
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(allyId);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === blancId)).toBe(true);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([cardId]);
  });

  it("used as an Option, plays a [Sistermon] card free and gives -3000 DP per of your Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: WHITE_SOURCE, as: "colourSource" },
            { card: NEUTRAL_LV3, as: "other" },
          ],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: CIEL_COST_4, as: "freePlay" },
            { card: SENTINEL, as: "spare" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 6;
    await s.ready();
    const freePlayId = s.inst("freePlay").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP !== 12_000);
    await settle();

    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === freePlayId)).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.perm("target").currentDP).toBe(12_000 - 9000);
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === cardId)).toBe(false);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toContain(cardId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("scales with the live count: one of your Digimon is -3000, not -9000", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WHITE_SOURCE, as: "colourSource" }],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: SENTINEL, as: "spare" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP !== 12_000);
    await settle();

    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("target").currentDP).toBe(12_000 - 3000);
  });

  it("plays the free [Sistermon] card out of the trash as well as the hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WHITE_SOURCE, as: "colourSource" }],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: SENTINEL, as: "spare" },
          ],
          trash: [{ card: CIEL_COST_4, as: "fromTrash" }],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 6;
    await s.ready();
    const fromTrashId = s.inst("fromTrash").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === fromTrashId));
    await settle();

    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.perm("target").currentDP).toBe(12_000 - 6000);
  });

  it("Q7427/Q7428: Gankoomon can use this Option because its Digimon face has [Huckmon] in its text", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-061", as: "gankoomon", under: [{ card: cardId, as: "divinePierce" }] }],
          hand: [{ card: SENTINEL, as: "spare" }],
          deck: inertDeck,
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(getCardDefinition(cardId)?.effectText).toContain("[Huckmon]");

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("gankoomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 9000);
    await settle();

    expect(s.perm("gankoomon").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toContain(cardId);
    expect(s.perm("target").currentDP).toBe(9000);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("refuses an over-cost [Sistermon] card and a card that only MENTIONS [Sistermon]", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WHITE_SOURCE, as: "colourSource" }],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: CIEL_COST_6, as: "overCost" },
            { card: HUCKMON_TEXT_ONLY, as: "textOnly" },
            { card: SENTINEL, as: "spare" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 6;
    await s.ready();
    const overCostId = s.inst("overCost").instanceId;
    const textOnlyId = s.inst("textOnly").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP !== 12_000);
    await settle();

    const handIds = s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
    expect(handIds).toContain(overCostId);
    expect(handIds).toContain(textOnlyId);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("target").currentDP).toBe(12_000 - 3000);
  });

  it("still applies the DP reduction when the optional free play is declined (§15-6-2)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: WHITE_SOURCE, as: "colourSource" },
            { card: NEUTRAL_LV3, as: "other" },
          ],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: CIEL_COST_4, as: "declined" },
            { card: SENTINEL, as: "spare" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoSelectCards: false, autoOrderTriggers: true, autoDeclineOptional: true },
    );
    s.state.memory = 6;
    await s.ready();
    const declinedId = s.inst("declined").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP !== 12_000);
    await settle();

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(declinedId);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.perm("target").currentDP).toBe(12_000 - 6000);
  });

  it("Q7429 finishes the Then clause before rule-deleting the newly played 0 DP Digimon", async () => {
    const auraId = "TEST-EX13-065-Q7429-AURA";
    syntheticDefinitions.set(auraId, {
      ...getCardDefinition(BIG_VANILLA)!,
      cardId: auraId,
      nameEn: "Synthetic Sistermon DP Aura",
    });
    registerIrCard(auraId, {
      effects: [
        {
          trigger: "AllTurns",
          actions: [
            {
              kind: "Aura",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Sistermon Blanc"], match: "nameExact" }],
                },
                count: "all",
              },
              effect: { kind: "modifyDP", amount: -5000 },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WHITE_SOURCE, as: "colourSource" }],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: BLANC, as: "freePlay" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: {
          battleArea: [
            { card: auraId, as: "aura" },
            { card: BIG_VANILLA, as: "target" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: false,
        autoOrderTriggers: true,
        declinePrompts: ["Arts Digivolve"],
      },
    );
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("freePlay").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");

    expect(s.perm("freePlay").currentDP).toBe(0);
    expect(
      s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === s.perm("freePlay").permanentId),
    ).toBe(true);
    const thenDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: thenDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("target").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === BLANC));

    expect(s.perm("target").currentDP).toBe(12_000 - 6000);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === BLANC)).toBe(false);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toContain(BLANC);
  });

  it("§4-19 Arts Digivolve: after the Option resolves, a [Sistermon Blanc] may digivolve into it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BLANC, as: "artsTarget" }],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: SENTINEL, as: "spare" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 6;
    await s.ready();
    const blancInstanceId = s.inst("artsTarget").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("artsTarget").topCard.cardId === cardId);
    await settle();

    expect(s.perm("target").currentDP).toBe(12_000 - 3000);
    expect(s.perm("artsTarget").stack.map(({ instanceId }) => instanceId)).toEqual([blancInstanceId]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).not.toContain(cardId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q7430 does not activate the played Sistermon Blanc's lost On Play effect after Arts Digivolve", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WHITE_SOURCE, as: "colourSource" }],
          hand: [
            { card: cardId, as: "divinePierce" },
            { card: BLANC, as: "artsTarget" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: false, autoOrderTriggers: true },
    );
    s.state.memory = 6;
    await s.ready();
    const deckBefore = s.state.players[0]!.deck.length;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("divinePierce").instanceId,
        useAs: "option",
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const handPlay = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: handPlay.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("artsTarget").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "selectCards" && s.state.pendingDecision.decisionId !== handPlay.decisionId,
    );
    const decision = s.state.pendingDecision!;
    expect(decision.promptText).toContain("Arts Digivolve");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("artsTarget").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("artsTarget").topCard.cardId === cardId);
    await settle();

    expect(s.perm("artsTarget").stack.map(({ cardId: id }) => id)).toEqual([BLANC]);
    expect(s.state.players[0]!.deck).toHaveLength(deckBefore - 1);
    expect(
      s.events.some(
        (event) => event.kind === "effectResolved" && event.sourceCardId === BLANC && event.timing === "OnPlay",
      ),
    ).toBe(false);
  });

  it("rejects a Digimon play declaration without firing the Option body", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WHITE_SOURCE, as: "colourSource" }],
          hand: [
            { card: cardId, as: "awakened" },
            { card: CIEL_COST_4, as: "wouldBeFreePlay" },
            { card: SENTINEL, as: "spare" },
          ],
          deck: inertDeck,
          security: [SENTINEL],
        },
        1: { battleArea: [{ card: BIG_VANILLA, as: "target" }], deck: inertDeck, security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 6;
    await s.ready();
    const wouldBeFreePlayId = s.inst("wouldBeFreePlay").instanceId;

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("awakened").instanceId, useAs: "digimon" }),
    ).toEqual({
      ok: false,
      reason: "not-playable-kind",
    });

    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === cardId)).toBe(false);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("awakened").instanceId);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(wouldBeFreePlayId);
    expect(s.perm("target").currentDP).toBe(12_000);
    expect(s.state.memory).toBe(6);
  });

  it("requires the Option side's White color for an implicit hand-use declaration", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: NEUTRAL_LV3, as: "redAlly" }],
        hand: [{ card: cardId, as: "blancAwakened" }],
        deck: inertDeck,
        security: [SENTINEL],
      },
      1: { deck: inertDeck, security: [SENTINEL] },
    });
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blancAwakened").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });

    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain(cardId);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).not.toContain(cardId);
  });
});
