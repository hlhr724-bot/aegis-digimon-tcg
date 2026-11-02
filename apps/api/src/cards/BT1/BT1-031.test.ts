import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-031.js";

describe("BT1-031 Monmon", () => {
  it("matches the catalog and exact Blocker IR", () => {
    expect(getCardDefinition("BT1-031")).toMatchObject({
      cardId: "BT1-031",
      nameEn: "Monmon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 4,
      dp: 1000,
      evoCosts: [{ color: "Blue", level: 2, memoryCost: 1 }],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Beast"],
      effectText:
        "＜Blocker＞ (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to " +
        "attack it instead.)",
    });
    expect(getCardDefinition("BT1-031")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-031")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [{ trigger: "Static", actions: [], keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }] }],
      coverage: "full",
      residual: [],
    });
  });

  it("has Blocker", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-031", as: "digimon" }] } });
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("digimon"), "Blocker")).toBe(true);
  });

  it("suspends to redirect an opposing attack away from the player", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-031", as: "blocker" }], security: ["BT1-081"] },
      1: { battleArea: [{ card: "BT1-028", as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    const blockerId = s.perm("blocker").permanentId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: blockerId })).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === blockerId));

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-031")).toBe(true);
  });

  it("can decline the optional block and leave the attack on the player", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-031", as: "blocker" }], security: ["BT1-081"] },
      1: { battleArea: [{ card: "BT1-028", as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(0, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0);

    expect(s.perm("blocker").isSuspended).toBe(false);
    expect(
      s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === s.perm("blocker").permanentId),
    ).toBe(true);
  });

  it("digivolves from a blue level 2 in breeding for 1 memory and retains Blocker", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT1-003", as: "base" },
        hand: [{ card: "BT1-031", as: "monmon" }],
        deck: [{ card: "BT1-026", as: "drawn" }],
      },
    });
    s.state.memory = 1;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("monmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("monmon").instanceId);

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-003"]);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Blocker")).toBe(true);
  });
});
