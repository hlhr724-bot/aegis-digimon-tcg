import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX2-066.js";
import "./EX2-008.js";
import "./EX2-014.js";
import "./EX2-066.js";
import "./EX2-050.js";
import "./EX2-060.js";

const inertDeck = ["BT1-009", "BT1-013", "BT1-009", "BT1-013"];
const inertSecurity = ["BT1-009", "BT1-013"];

describe("EX2-066 Offensive Plug-In A", () => {
  it("matches the catalog and compiled IR for color waiver, Main, and Security", () => {
    expect(getCardDefinition("EX2-066")).toMatchObject({
      cardId: "EX2-066",
      nameEn: "Offensive Plug-In A",
      colors: ["Red"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      rarity: "C",
      maxCountInDeck: 4,
      effectText:
        "While you have a Tamer in play, you may use this card without meeting its color requirements.[Main] 1 of your Digimon gains ＜Security Attack +1＞ for the turn. (This Digimon checks 1 additional security card.)",
      securityEffectText:
        "[Security] Reveal the top 3 cards of your deck. Add 1 Tamer card among them to your hand. Place the remaining cards at the bottom of your deck in any order. Then, add this card to your hand.",
    });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Static",
          actions: [
            {
              kind: "WaiveColorRequirement",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              condition: {
                kind: "youHave",
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"] },
                raw: "you have a Tamer in play",
              },
            },
          ],
        }),
        expect.objectContaining({
          trigger: "Main",
          actions: [
            {
              effectTextPart:
                "[Main] 1 of your Digimon gains ＜Security Attack +1＞ for the turn. (This Digimon checks 1 additional security card.)",
              kind: "GainKeyword",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              keyword: { keyword: "SecurityAttack", amount: 1, raw: "＜Security Attack +1＞" },
              duration: "forTheTurn",
            },
          ],
        }),
        expect.objectContaining({
          trigger: "Security",
          isSecurity: true,
          actions: [
            {
              effectTextPart:
                "[Security] Reveal the top 3 cards of your deck. Add 1 Tamer card among them to your hand. Place the remaining cards at the bottom of your deck in any order.",
              kind: "RevealAdd",
              revealCount: 3,
              add: [{ filter: { controllerDefault: "mine", kind: ["Tamer"] }, count: 1, to: "hand" }],
              rest: "deckBottom",
            },
            { effectTextPart: "Then, add this card to your hand.", kind: "AddToHandSelf" },
          ],
        }),
      ]),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("gives one Digimon Security Attack +1 for the turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX2-008", as: "target", dp: 7000 }, "EX2-060"],
          hand: [{ card: "EX2-066", as: "option" }],
          deck: inertDeck,
          security: inertSecurity,
        },
        1: { security: inertSecurity, deck: inertDeck },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack") === 1);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(1);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.filter(({ kind }) => kind === "securityChecked").length === 2);
    expect(s.events.filter(({ kind }) => kind === "securityChecked")).toHaveLength(2);
    expect(s.perm("target").isSuspended).toBe(true);

    const turnLoop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(0);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await turnLoop;
  });

  it("waives the red color requirement only while a Tamer is in play", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX2-014", as: "blue" }], hand: [{ card: "EX2-066", as: "option" }] },
    });
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("waives the red color requirement with a Tamer even when no red card is in play", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX2-014", as: "blue" },
          { card: "EX2-060", as: "tamer" },
        ],
        hand: [{ card: "EX2-066", as: "option" }],
        deck: inertDeck,
        security: inertSecurity,
      },
      1: { deck: inertDeck, security: inertSecurity },
    });
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).keywordAmount(s.perm("blue"), "SecurityAttack") === 1);
    expect(observe(s.engine).keywordAmount(s.perm("blue"), "SecurityAttack")).toBe(1);
  });

  it("reveals a Tamer, returns the other revealed cards to the bottom, then adds itself to hand from security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX2-050", as: "attacker" }],
          deck: inertDeck,
          security: inertSecurity,
        },
        1: {
          security: [{ card: "EX2-066", as: "securityOption" }, ...inertSecurity],
          deck: [
            { card: "EX2-060", as: "revealedTamer" },
            { card: "BT1-009", as: "firstBottom" },
            { card: "BT1-013", as: "secondBottom" },
            ...inertDeck,
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() &&
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("securityOption").instanceId),
    );
    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("securityOption").instanceId, s.inst("revealedTamer").instanceId]),
    );
    expect(s.state.players[1]!.deck.slice(-2).map((card) => card.instanceId)).toEqual([
      s.inst("firstBottom").instanceId,
      s.inst("secondBottom").instanceId,
    ]);
  });
});
