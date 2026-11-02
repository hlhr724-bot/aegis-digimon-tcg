import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import compiled from "./BT1-042.js";

describe("BT1-042 LoaderLeomon", () => {
  it("matches the errata-corrected catalog and residual-free IR contract", () => {
    expect(getCardDefinition("BT1-042")).toMatchObject({
      cardId: "BT1-042",
      set: "BT1",
      nameEn: "LoaderLeomon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 10000,
      evoCosts: [{ color: "Blue", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Machine"],
      rarity: "U",
      maxCountInDeck: 4,
      imageId: "BT1-042-Errata",
      nameJp: "ローダーレオモン",
    });
    expect(getCardDefinition("BT1-042")?.effectText).toBeUndefined();
    expect(getCardDefinition("BT1-042")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-042")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({ effects: [], coverage: "full", residual: [] });
  });

  it("plays for 7 memory as a 10000 DP Digimon", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "BT1-042", as: "loaderLeomon" }] } });
    s.state.memory = 7;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("loaderLeomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.battleArea[0]).toMatchObject({ baseDP: 10000, currentDP: 10000 });
  });

  it("digivolves from a blue level 4 for 3 memory", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-037", as: "base" }],
        hand: [{ card: "BT1-042", as: "loaderLeomon" }],
        deck: [{ card: "BT1-010", as: "drawn" }],
      },
    });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("loaderLeomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("loaderLeomon").instanceId);

    expect(s.state.memory).toBe(0);
    expect(s.perm("base")).toMatchObject({ baseDP: 10000, currentDP: 10000 });
    expect(s.state.players[0]!.hand[0]!.instanceId).toBe(s.inst("drawn").instanceId);
  });

  it("rejects evolution from a red level 4 despite matching level", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-014", as: "base" }], hand: [{ card: "BT1-042", as: "loaderLeomon" }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("loaderLeomon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});
