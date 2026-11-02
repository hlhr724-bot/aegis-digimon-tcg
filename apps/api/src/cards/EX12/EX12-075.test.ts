import { compiledEffects, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { compiled } from "./EX12-075.js";
import "../index.js";

const CARD_ID = "EX12-075";

describe("EX12-075 Kunlun's Imperial Decree", () => {
  it("models the Use Requirement and main search-to-battle-area sequence", () => {
    const main = compiled.effects.find((effect) => effect.trigger === "Main" && !effect.keywords);
    expect(main?.actions).toEqual([
      expect.objectContaining({
        effectTextPart:
          "[Main] Reveal the top 3 cards of your deck. Add 1 [Shambala] trait card among them to the hand. Return the rest to the bottom of the deck.",
        kind: "RevealAdd",
        revealCount: 3,
        add: [
          {
            filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Shambala"], match: "trait" }] },
            count: 1,
            to: "hand",
          },
        ],
        rest: "deckBottom",
      }),
      { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
    ]);
  });

  it("keeps Delay, gain 2 memory, and Security placement as separate printed clauses", () => {
    expect(compiled.effects).toContainEqual({
      trigger: "Main",
      actions: [{ effectTextPart: "Gain 2 memory.", kind: "GainMemory", amount: 2 }],
      keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
    });
    expect(compiled.effects).toContainEqual({
      trigger: "Security",
      actions: [{ kind: "PlaceInBattleAreaSelf" }],
      isSecurity: true,
    });
  });

  it("keeps the Use Req and complete registered evidence", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.find((effect) => effect.trigger === "Static")?.actions[0]).toMatchObject({
      kind: "WaiveColorRequirement",
      condition: {
        kind: "youHave",
        filter: { kind: ["Digimon", "Tamer"], nameOrTrait: [{ tokens: ["Shambala"], match: "trait" }] },
      },
    });
    expect(registeredCompiledCards.get(CARD_ID)).toEqual(compiled);
    expect(compiledEffects[CARD_ID]).toBeDefined();
    expect(compiledEffects[CARD_ID]).toEqual(compiled);
  });

  it("reveals three, adds one Shambala card, returns the rest to deck bottom, and places itself", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-006", as: "shambala" }],
          hand: [{ card: CARD_ID, as: "option" }],
          deck: ["EX12-006", "BT1-009", "EX12-008"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === optionId));

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "EX12-006")).toBe(true);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-009", "EX12-008"]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === optionId)).toBe(true);
  });

  it("does not use the Option without a Shambala card in play", async () => {
    const s = setupEngine({ 0: { hand: [{ card: CARD_ID, as: "option" }] } });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("uses the white Option with a Shambala Digimon in the breeding area", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX12-022", as: "shambalaInBreeding" },
          hand: [{ card: CARD_ID, as: "option" }],
          deck: ["EX12-006", "BT1-009", "EX12-008"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;
    const optionId = s.inst("option").instanceId;

    expect(s.inst("option").playableFromHand).toBe(true);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === optionId));

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.some(({ cardId }) => cardId === "EX12-006")).toBe(true);
  });

  it.each([
    ["EX12-002", true],
    ["EX10-001", false],
  ])("treats the breeding Digi-Egg %s as a Digimon and applies the Shambala trait boundary", async (egg, legal) => {
    const s = setupEngine({
      0: {
        breeding: { card: egg, as: "egg" },
        hand: [{ card: CARD_ID, as: "option" }],
        deck: ["EX12-006", "BT1-009", "EX12-008"],
      },
    });
    await s.ready();
    s.state.memory = 3;

    expect(s.inst("option").playableFromHand).toBe(legal);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toMatchObject(
      legal ? { ok: true } : { ok: false, reason: "color-requirement-unmet" },
    );
  });

  it("returns all three revealed cards to deck bottom when none has the Shambala trait", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-006", as: "shambala" }],
          hand: [{ card: CARD_ID, as: "option" }],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID));

    expect(s.state.players[0]!.deck.map(({ cardId }) => cardId).sort()).toEqual(["BT1-009", "BT1-010", "BT1-011"]);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("arms Delay only after entering the battle area and gains 2 memory on a later turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-006", as: "shambala" }],
          hand: [{ card: CARD_ID, as: "option" }],
          deck: ["EX12-006", "BT1-009", "EX12-008"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === optionId));
    const optionPermanent = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === optionId,
    )!;
    optionPermanent.enterFieldTurnCount = s.state.turnCount - 1;
    s.state.memory = 2;
    await s.engine.recomputeContinuousEffects();

    const effects = observe(s.engine).activatableEffects(optionPermanent) as Array<{ effectKey: string }>;
    expect(effects).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: optionId, effectKey: effects[0]!.effectKey }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 4 && s.state.players[0]!.trash.some((card) => card.instanceId === optionId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(true);
  });

  it("does not expose Delay during the turn it entered the battle area", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "option" }] } });
    s.perm("option").placedByEffect = true;
    s.perm("option").enterFieldTurnCount = s.state.turnCount;
    await s.ready();

    expect(observe(s.engine).activatableEffects(s.perm("option"))).toHaveLength(0);
    expect(s.state.memory).toBe(0);
  });

  it("places itself in the battle area when revealed as Security", async () => {
    const s = setupEngine({ 0: { security: [{ card: CARD_ID, as: "security", faceUp: true }] } });
    const optionId = s.inst("security").instanceId;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("security"));

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === optionId)).toBe(true);
  });

  it("is not enabled by a resident Option carrying the Use Req. trait", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX12-071", as: "residentOption" }],
        hand: [{ card: CARD_ID, as: "useReqOption" }],
      },
    });
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("useReqOption").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("matches the complete catalog identity", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Kunlun's Imperial Decree",
      colors: ["White"],
      kinds: ["Option"],
      playCost: 3,
      dp: 0,
      evoCosts: [],
      types: ["Shambala", "SW", "TB"],
    });
  });
});
