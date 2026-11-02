import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-097.js";

describe("BT1-097 Boring Storm", () => {
  it("matches the catalog and compiles both printed draw effects", () => {
    expect(getCardDefinition("BT1-097")).toMatchObject({
      cardId: "BT1-097",
      set: "BT1",
      nameEn: "Boring Storm",
      colors: ["Blue"],
      kinds: ["Option"],
      playCost: 1,
      dp: 0,
      evoCosts: [],
      effectText: "[Main] Trigger ＜Draw 1＞ (Draw 1 card from your deck).",
      securityEffectText: "[Security] Trigger ＜Draw 2＞ (Draw 2 cards from your deck).",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-097",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] Trigger ＜Draw 1＞ (Draw 1 card from your deck).",
            kind: "Draw",
            controller: "mine",
            amount: 1,
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "Draw", controller: "mine", amount: 2 }], isSecurity: true },
    ]);
  });

  it("draws exactly the top card and trashes the used Option", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT1-028"],
        hand: [{ card: "BT1-097", as: "option" }],
        deck: [
          { card: "BT1-029", as: "drawn" },
          { card: "BT1-030", as: "remaining" },
        ],
      },
    });
    const optionId = s.inst("option").instanceId;
    s.state.memory = 1;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === optionId));

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("remaining").instanceId]);
  });

  it("draws exactly 2 when revealed in security through a real attack", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT1-097", as: "securityOption" }],
        deck: [
          { card: "BT1-029", as: "first" },
          { card: "BT1-030", as: "second" },
          { card: "BT1-031", as: "remaining" },
        ],
      },
      1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 5000 }] },
    });
    const securityOptionId = s.inst("securityOption").instanceId;

    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0 && !observe(s.engine).isAttacking());

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([
      s.inst("first").instanceId,
      s.inst("second").instanceId,
    ]);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === securityOptionId)).toBe(false);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("remaining").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(securityOptionId);
  });
});
