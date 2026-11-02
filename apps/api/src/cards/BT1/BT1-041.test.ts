import { describe, expect, it } from "vitest";
import { getCardDefinition, type PlayerState } from "@aegis/shared";
import { drainMicrotasks, setupEngine, settle, type SeatSpec } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-041.js";

describe("BT1-041 Zudomon", () => {
  it("matches the catalog and exact On Play/inherited IR contract", () => {
    expect(getCardDefinition("BT1-041")).toMatchObject({
      cardId: "BT1-041",
      set: "BT1",
      nameEn: "Zudomon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 6000,
      evoCosts: [{ color: "Blue", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Sea Beast"],
      effectText: "[On Play] Trigger ＜Draw 2＞. (Draw 2 cards from your deck.)",
      inheritedEffectText:
        "[When Attacking] If your opponent has a Digimon with no digivolution cards in play, gain 1 memory.",
      rarity: "SR",
      maxCountInDeck: 4,
      imageId: "BT1-041",
      nameJp: "ズドモン",
    });
    expect(getCardDefinition("BT1-041")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        { trigger: "OnPlay", actions: [{ kind: "Draw", controller: "mine", amount: 2 }] },
        {
          trigger: "WhenAttacking",
          isInherited: true,
          actions: [
            {
              kind: "GainMemory",
              amount: 1,
              condition: {
                kind: "opponentHas",
                countMin: 1,
                filter: { kind: ["Digimon"], zone: "battleArea", digivolutionCards: "none" },
              },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("draws two cards on play", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT1-041", as: "zudomon" }],
        deck: [
          { card: "BT1-029", as: "drawnA" },
          { card: "BT1-030", as: "drawnB" },
        ],
      },
    });
    const player = s.state.players[0] as PlayerState;
    s.state.memory = 7;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("zudomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => player.deck.length === 0);

    expect(player.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("drawnA").instanceId, s.inst("drawnB").instanceId]),
    );
  });

  it("gains exactly 1 memory when attacking while the opponent has a Digimon without sources", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-042", under: ["BT1-041"], as: "attacker" }] },
      1: {
        battleArea: [
          { card: "BT1-010", as: "sourceLessA" },
          { card: "BT1-011", as: "sourceLessB" },
        ],
        security: ["BT1-012"],
      },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 1);

    expect(s.state.memory).toBe(1);
  });

  it("does not count a source-less Digimon in the opponent's breeding area", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-042", under: ["BT1-041"], as: "attacker" }] },
      1: { breeding: "BT1-010", security: ["BT1-011"] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.memory).toBe(0);
  });

  it("retains the inherited source through a legal blue level-4 evolution", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-037", as: "base" }],
        hand: [
          { card: "BT1-041", as: "zudomon" },
          { card: "ST2-10", as: "levelSix" },
        ],
        deck: [
          { card: "BT1-010", as: "drawnFirst" },
          { card: "BT1-011", as: "drawnSecond" },
        ],
      },
      1: { battleArea: [{ card: "BT1-010", as: "sourceLess" }], security: ["BT1-011"] },
    });
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("zudomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("zudomon").instanceId);

    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawnFirst").instanceId)).toBe(true);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-037"]);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("levelSix").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("levelSix").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawnSecond").instanceId)).toBe(true);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-037", "BT1-041"]);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.memory === 1);
    expect(s.state.memory).toBe(1);
  });
});

describe("BT1-041 Zudomon — KB Q&A rulings", () => {
  async function attackWithZudomonSource(opponent: SeatSpec): Promise<number> {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-042", under: ["BT1-041"], as: "attacker" }] },
      1: { security: ["BT1-012"], ...opponent },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    await drainMicrotasks();
    return s.state.memory;
  }

  it("gains only 1 memory no matter how many opposing Digimon have no digivolution cards (Q898)", async () => {
    const memory = await attackWithZudomonSource({
      battleArea: [
        { card: "BT1-010", as: "sourceLessA" },
        { card: "BT1-011", as: "sourceLessB" },
        { card: "BT1-016", as: "sourceLessC" },
      ],
    });

    expect(memory).toBe(1);
  });

  it("ignores a Digimon with no digivolution cards in the opponent's breeding area (Q899)", async () => {
    const breedingOnly = await attackWithZudomonSource({
      breeding: "BT1-010",
      battleArea: [{ card: "BT1-016", under: ["BT1-011"] }],
    });
    const sameDigimonInBattleArea = await attackWithZudomonSource({
      battleArea: ["BT1-010", { card: "BT1-016", under: ["BT1-011"] }],
    });

    expect(breedingOnly).toBe(0);
    expect(sameDigimonInBattleArea).toBe(1);
  });
});
