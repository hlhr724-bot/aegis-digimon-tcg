import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX2-068.js";
import "./EX2-068.js";

const inertDeck = ["BT1-009", "BT1-010", "BT1-011", "BT1-012"];
const inertSecurity = ["BT1-013", "BT1-014"];

describe("EX2-068 High-Speed Plug-In D", () => {
  it("matches the catalog and typed IR for color waiver, Main, and Security", () => {
    expect(getCardDefinition("EX2-068")).toMatchObject({
      cardId: "EX2-068",
      nameEn: "High-Speed Plug-In D",
      colors: ["Blue"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      rarity: "C",
      maxCountInDeck: 4,
      effectText:
        "While you have a Tamer in play, you may use this card without meeting its color requirements.[Main] For the turn, 1 of your Digimon gains ＜Jamming＞ (This Digimon can't be deleted in battles against Security Digimon) and can't be blocked by your opponent's Digimon.",
      securityEffectText: "[Security] ＜Draw 1＞. (Draw 1 card from your deck.) Then, add this card to your hand.",
    });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Static",
          actions: [
            expect.objectContaining({
              kind: "WaiveColorRequirement",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              condition: expect.objectContaining({
                kind: "youHave",
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"] },
              }),
            }),
          ],
        }),
        expect.objectContaining({
          trigger: "Main",
          actions: [
            {
              effectTextPart:
                "[Main] For the turn, 1 of your Digimon gains ＜Jamming＞ (This Digimon can't be deleted in battles against Security Digimon) and can't be blocked by your opponent's Digimon.",
              kind: "GainKeyword",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              keyword: { keyword: "Jamming", raw: "＜Jamming＞" },
              duration: "forTheTurn",
            },
            {
              effectTextPart:
                "[Main] For the turn, 1 of your Digimon gains ＜Jamming＞ (This Digimon can't be deleted in battles against Security Digimon) and can't be blocked by your opponent's Digimon.",
              kind: "Restrict",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, sameTarget: true },
              restriction: "cantBeBlocked",
              duration: "forTheTurn",
              raw: "can't be blocked by your opponent's Digimon",
            },
          ],
        }),
        expect.objectContaining({
          trigger: "Security",
          isSecurity: true,
          actions: [
            {
              kind: "Draw",
              controller: "mine",
              amount: 1,
              effectTextPart: "[Security] ＜Draw 1＞. (Draw 1 card from your deck.)",
            },
            { kind: "AddToHandSelf" },
          ],
        }),
      ]),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("gives one Digimon Jamming for the turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX2-014", as: "target" },
            { card: "EX2-060", as: "other" },
          ],
          hand: [{ card: "EX2-068", as: "option" }],
          deck: inertDeck,
        },
        1: { security: ["EX2-015", ...inertSecurity], deck: inertDeck },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        observe(s.engine).hasKeyword(s.perm("target"), "Jamming") &&
        observe(s.engine).isRestricted(s.perm("target"), "cantBeBlocked"),
    );
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Jamming")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "cantBeBlocked")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("other"), "Jamming")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("other"), "cantBeBlocked")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("target").isSuspended).toBe(true);
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === s.perm("target").permanentId),
    ).toBe(true);

    const turnLoop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Jamming")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("target"), "cantBeBlocked")).toBe(false);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await turnLoop;
    assertNoLoudGap(s);
  });

  it("waives the blue color requirement only while a Tamer is in play", async () => {
    const s = setupEngine({ 0: { battleArea: ["EX2-019"], hand: [{ card: "EX2-068", as: "option" }] } });
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("waives the blue color requirement with a Tamer even when no blue card is in play", async () => {
    const s = setupEngine({
      0: { battleArea: ["EX2-019", "EX2-060"], hand: [{ card: "EX2-068", as: "option" }] },
    });
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
  });

  it("does not open a block window against a Blocker when the target has the unblockable effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX2-014", as: "target" }, "EX2-060"], hand: [{ card: "EX2-068", as: "option" }] },
        1: { battleArea: [{ card: "EX2-031", as: "blocker" }], security: inertSecurity, deck: inertDeck },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "cantBeBlocked"));
    const blockWindowsBefore = s.events.filter(({ kind }) => kind === "blockWindowOpened").length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.events.filter(({ kind }) => kind === "blockWindowOpened").length).toBe(blockWindowsBefore);
    expect(s.perm("target").isSuspended).toBe(true);
  });

  it("draws one card and returns itself to hand from Security", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX2-050", as: "attacker" }], deck: inertDeck, security: inertSecurity },
        1: {
          security: [{ card: "EX2-068", as: "securityOption" }, ...inertSecurity],
          deck: [{ card: "BT1-014", as: "drawn" }, "BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoOrderCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 5;
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
      expect.arrayContaining([s.inst("securityOption").instanceId, s.inst("drawn").instanceId]),
    );
    expect(s.state.players[1]!.deck).toHaveLength(3);
    expect(s.state.memory).toBe(5);
  });
});
