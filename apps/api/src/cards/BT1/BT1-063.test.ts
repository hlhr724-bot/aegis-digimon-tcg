import { getCardDefinition, type PlayerState } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-063.js";
describe("BT1-063 Seraphimon", () => {
  it("matches the catalog and exact compiled IR contract", () => {
    expect(getCardDefinition("BT1-063")).toMatchObject({
      cardId: "BT1-063",
      set: "BT1",
      nameEn: "Seraphimon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 10000,
      evoCosts: [{ color: "Yellow", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Seraph", "Three Great Angels"],
      effectText:
        "[When Digivolving] Trigger ＜Recovery +1 (Deck)＞. (Place the top card of your deck on top of your security stack.)[Your Turn] While you have 3 or more security cards, this Digimon gains ＜Security Attack +1＞. (This Digimon checks 1 additional security card.)",
      rarity: "SR",
      maxCountInDeck: 4,
      imageId: "BT1-063",
      nameJp: "セラフィモン",
    });
    expect(getCardDefinition("BT1-063")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-063")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        { trigger: "WhenDigivolving", actions: [{ kind: "Recover", amount: 1 }] },
        {
          trigger: "YourTurn",
          actions: [
            {
              kind: "GainKeyword",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              keyword: { keyword: "SecurityAttack", amount: 1 },
              duration: "forTheTurn",
              condition: { kind: "securityAtLeast", value: 3 },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("recovers the top deck card when digivolving", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-059", as: "base" }],
        hand: [{ card: "BT1-063", as: "evolving" }],
        deck: [
          { card: "BT1-010", as: "drawn" },
          { card: "BT1-049", as: "recovered" },
        ],
      },
    });
    const player = s.state.players[0] as PlayerState;
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => player.security.some((c) => c.instanceId === s.inst("recovered").instanceId));

    expect(player.deck).toHaveLength(0);
    expect(player.security[0]!.instanceId).toBe(s.inst("recovered").instanceId);
    expect(player.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it.each([
    { security: ["BT1-050", "BT1-050"], amount: 0 },
    { security: ["BT1-050", "BT1-050", "BT1-050"], amount: 1 },
    {
      security: ["BT1-050", "BT1-050", "BT1-050", "BT1-050", "BT1-050", "BT1-050"],
      amount: 1,
    },
  ])("grants Security Attack +$amount with $security security on its owner's turn", async ({ security, amount }) => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-063", as: "seraphimon" }], security } });
    await s.ready();

    expect(observe(s.engine).keywordAmount(s.perm("seraphimon"), "SecurityAttack")).toBe(amount);
  });

  it("does not grant Security Attack during the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-063", as: "seraphimon" }],
        security: ["BT1-050", "BT1-050", "BT1-050", "BT1-050", "BT1-050", "BT1-050"],
      },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(observe(s.engine).keywordAmount(s.perm("seraphimon"), "SecurityAttack")).toBe(0);
  });

  it("digivolves through a legal yellow level 5, recovers, and keeps the stack source", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-059", as: "base" }],
        hand: [{ card: "BT1-063", as: "seraphimon" }],
        deck: [
          { card: "BT1-050", as: "evolutionDraw" },
          { card: "BT1-051", as: "recovered" },
        ],
        security: ["BT1-050", "BT1-050"],
      },
    });
    const player = s.state.players[0] as PlayerState;
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("seraphimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => player.security.some((card) => card.instanceId === s.inst("recovered").instanceId));

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-059"]);
    expect(player.hand.map((card) => card.instanceId)).toContain(s.inst("evolutionDraw").instanceId);
    expect(player.security[0]?.instanceId).toBe(s.inst("recovered").instanceId);
    expect(s.state.memory).toBe(0);
  });

  it("rejects evolution from a red level 5 despite matching the evolution level", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-024", as: "redBase" }], hand: [{ card: "BT1-063", as: "seraphimon" }] },
    });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("seraphimon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});

describe("BT1-063 Seraphimon — KB Q&A rulings", () => {
  it("checks only 1 additional security card even with 6 security cards (Q921)", async () => {
    const opponentSecurityAfterAttack = async (ownSecurityCount: number) => {
      const s = setupEngine({
        0: {
          battleArea: [{ card: "BT1-063", as: "seraphimon" }],
          security: Array.from({ length: ownSecurityCount }, () => "BT1-049"),
        },
        1: { security: Array.from({ length: 6 }, () => "BT1-049") },
      });
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("seraphimon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await advance(s.engine).finishAttack();
      expect(s.state.players[0]!.battleArea).toHaveLength(1);
      return s.state.players[1]!.security.length;
    };

    expect(await opponentSecurityAfterAttack(6)).toBe(4);
    expect(await opponentSecurityAfterAttack(2)).toBe(5);
  });
});
