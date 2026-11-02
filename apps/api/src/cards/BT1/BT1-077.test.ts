import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./BT1-072.js";
import { compiled } from "./BT1-077.js";
import "./BT1-081.js";

describe("BT1-077 Okuwamon", () => {
  it("matches the catalog and exact inherited-effect IR contract", () => {
    expect(getCardDefinition("BT1-077")).toMatchObject({
      cardId: "BT1-077",
      set: "BT1",
      nameEn: "Okuwamon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 6000,
      evoCosts: [{ color: "Green", level: 4, memoryCost: 2 }],
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Insectoid"],
      inheritedEffectText:
        "[Your Turn] When this Digimon deletes an opponent's Digimon in battle and survives, gain 1 memory.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-077",
      nameJp: "オオクワモン",
    });
    expect(getCardDefinition("BT1-077")?.effectText).toBeUndefined();
    expect(getCardDefinition("BT1-077")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "YourTurn",
          isInherited: true,
          actions: [
            {
              kind: "SubTrigger",
              event: "whenDeletesInBattle",
              sourceFilter: { isSelfRef: true, controller: "mine", kind: ["Digimon"] },
              actions: [
                {
                  kind: "GainMemory",
                  amount: 1,
                  condition: { kind: "triggerSourceNotDeletedAtSameTiming" },
                },
              ],
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gains 1 memory when its Digimon deletes an opponent in battle and survives", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-072", as: "base" }],
        hand: [
          { card: "BT1-077", as: "okuwamon" },
          { card: "BT1-081", as: "attacker" },
        ],
        deck: ["BT1-010", "BT1-011"],
      },
      1: { battleArea: [{ card: "BT1-016", as: "defender", dp: 1000, suspended: true }] },
    });
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("okuwamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("okuwamon").instanceId);
    expect(s.state.memory).toBe(3);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("attacker").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("attacker").instanceId);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-072", "BT1-077"]);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.memory === 1);
    expect(s.state.memory).toBe(1);
  });

  it("does not gain memory when both Digimon are deleted in a tied battle", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-081", as: "attacker", dp: 6000, under: ["BT1-077"] }] },
      1: { battleArea: [{ card: "BT1-016", as: "defender", dp: 6000, suspended: true }] },
    });
    const attackerId = s.perm("attacker").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === attackerId));

    expect(s.state.memory).toBe(0);
  });

  it("does not gain memory from a security battle", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-081", as: "attacker", dp: 10000, under: ["BT1-077"] }] },
      1: { security: ["BT1-016"] },
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

  it("gains memory when a Blocker is deleted during the blocked attack (Q929)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-081", as: "attacker", dp: 10000, under: ["BT1-077"] }] },
      1: { battleArea: [{ card: "BT1-072", as: "blocker", dp: 1000 }], security: ["BT1-010"] },
    });
    await s.ready();

    const attackerId = s.perm("attacker").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));

    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.memory === 1);

    expect(s.state.memory).toBe(1);
  });

  it("does not apply while Okuwamon is the top card", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-077", as: "attacker", dp: 10000 }] },
      1: { battleArea: [{ card: "BT1-016", as: "defender", dp: 1000, suspended: true }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.memory).toBe(0);
  });

  it("rejects evolution from a non-green level 4", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-036", as: "blueBase" }], hand: [{ card: "BT1-077", as: "okuwamon" }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("blueBase").permanentId,
        instanceId: s.inst("okuwamon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});

describe("BT1-077 Okuwamon — KB Q&A rulings", () => {
  it("does not gain memory when its Digimon deletes a Security Digimon (Q928)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-071", as: "attacker", dp: 10000, under: ["BT1-077"] }] },
      1: { security: [{ card: "BT1-049", as: "securityDigimon" }] },
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityDigimon").instanceId);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.memory).toBe(0);

    const control = setupEngine({
      0: { battleArea: [{ card: "BT1-071", as: "attacker", dp: 10000, under: ["BT1-077"] }] },
      1: { battleArea: [{ card: "BT1-049", as: "defender", suspended: true }] },
    });
    await control.ready();
    expect(
      control.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: control.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: control.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await advance(control.engine).finishAttack();
    expect(control.state.players[1]!.battleArea).toHaveLength(0);
    expect(control.state.memory).toBe(1);
  });
});
