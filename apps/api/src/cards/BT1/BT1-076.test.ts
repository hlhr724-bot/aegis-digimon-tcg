import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-076.js";

describe("BT1-076 MegaKabuterimon", () => {
  it("matches the catalog and inherited threshold IR contract", () => {
    expect(getCardDefinition("BT1-076")).toMatchObject({
      cardId: "BT1-076",
      set: "BT1",
      nameEn: "MegaKabuterimon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 6000,
      evoCosts: [{ color: "Green", level: 4, memoryCost: 2 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Insectoid"],
      rarity: "U",
      maxCountInDeck: 4,
      imageId: "BT1-076",
      nameJp: "アトラーカブテリモン",
    });
    expect(getCardDefinition("BT1-076")?.effectText).toBeUndefined();
    expect(getCardDefinition("BT1-076")?.inheritedEffectText).toBe(
      "[When Attacking] If your opponent has 2 or more suspended Digimon, gain 1 memory.",
    );
    expect(getCardDefinition("BT1-076")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "WhenAttacking",
          isInherited: true,
          actions: [
            {
              kind: "GainMemory",
              amount: 1,
              condition: {
                kind: "permanentCount",
                seat: "opponent",
                op: "gte",
                value: 2,
                filter: { kind: ["Digimon"], suspended: true },
              },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gains 1 memory when attacking while the opponent has 2 suspended Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-074", as: "attacker", under: ["BT1-076"] }] },
      1: {
        battleArea: [
          { card: "BT1-016", suspended: true },
          { card: "BT1-017", suspended: true },
        ],
        security: ["BT1-010"],
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

  it("still gains only 1 memory with 4 suspended opposing Digimon (Q927)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-074", as: "attacker", under: ["BT1-076"] }] },
      1: {
        battleArea: [
          { card: "BT1-016", suspended: true },
          { card: "BT1-017", suspended: true },
          { card: "BT1-070", suspended: true },
          { card: "BT1-071", suspended: true },
        ],
        security: ["BT1-010"],
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

  it("carries MegaKabuterimon through a legal level 4 to level 6 stack", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-073", as: "base" }],
        hand: [
          { card: "BT1-076", as: "megaKabuterimon" },
          { card: "BT1-080", as: "host" },
        ],
        deck: ["BT1-009", "BT1-014"],
      },
      1: {
        battleArea: [
          { card: "BT1-016", suspended: true },
          { card: "BT1-017", suspended: true },
        ],
        security: ["BT1-010"],
      },
    });
    s.state.memory = 4;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("megaKabuterimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("megaKabuterimon").instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("host").instanceId);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-073", "BT1-076"]);
    expect(s.state.memory).toBe(0);
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

  it("does not gain memory with only 1 suspended opposing Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-074", as: "attacker", under: ["BT1-076"] }] },
      1: { battleArea: [{ card: "BT1-016", suspended: true }], security: ["BT1-010"] },
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

  it("does not count a suspended opposing Tamer", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-074", as: "attacker", under: ["BT1-076"] }] },
      1: {
        battleArea: [
          { card: "BT1-016", suspended: true },
          { card: "BT1-085", suspended: true },
        ],
        security: ["BT1-010"],
      },
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

  it("does not apply while MegaKabuterimon is the top card", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-076", as: "attacker" }] },
      1: {
        battleArea: [
          { card: "BT1-016", suspended: true },
          { card: "BT1-017", suspended: true },
        ],
        security: ["BT1-010"],
      },
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

  it("rejects evolution from a red level 4", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-016", as: "redBase" }], hand: [{ card: "BT1-076", as: "megaKabuterimon" }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("megaKabuterimon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});
