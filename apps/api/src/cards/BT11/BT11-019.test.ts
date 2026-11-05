import { digiXrosRequirementFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT11-019.js";

describe("BT11-019 Shoutmon X7", () => {
  it("matches the catalog and publishes the exact six-slot DigiXros -2 recipe", () => {
    expect(getCardDefinition("BT11-019")).toMatchObject({
      cardId: "BT11-019",
      nameEn: "Shoutmon X7",
      colors: ["Red", "White"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 14,
      dp: 13000,
      evoCosts: [
        { color: "Red", level: 5, memoryCost: 6 },
        { color: "Blue", level: 6, memoryCost: 4 },
      ],
      forms: ["Mega"],
      attributes: ["Data"],
      types: ["Composite", "Xros Heart", "Blue Flare"],
    });
    expect(digiXrosRequirementFor("BT11-019")).toEqual([
      {
        materials: ["OmniShoutmon", "ZeigGreymon", "Ballistamon", "Dorulumon", "Starmons", "Sparrowmon"].map(
          (name) => ({ names: [name] }),
        ),
        count: 2,
      },
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("DigiXroses all six distinct slots for cost 2 and applies source-scaled DP before On Play", async () => {
    const materialCards = ["BT11-015", "BT11-031", "BT10-049", "BT10-034", "BT10-029", "BT10-060"];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT11-019", as: "x7" }, ...materialCards.map((card, index) => ({ card, as: `m${index}` }))],
        },
        1: { battleArea: [{ card: "BT1-028", as: "boostedBoundary", dp: 16000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("x7").instanceId,
        digiXros: { materialInstanceIds: materialCards.map((_, index) => s.inst(`m${index}`).instanceId) },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.memory).toBe(8);
    expect(s.state.players[0]!.battleArea[0]!.stack).toHaveLength(6);
    expect(s.state.players[0]!.battleArea[0]!.currentDP).toBe(16000);
  });

  it("supports both printed evolution routes and their exact costs", async () => {
    for (const [base, cost] of [
      ["BT11-015", 6],
      ["BT11-018", 4],
    ] as const) {
      const s = setupEngine({
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT11-019", as: "x7" }] },
      });
      s.state.memory = 8;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("x7").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "BT11-019");
      expect(s.state.memory).toBe(8 - cost);
    }
  });

  it("has Rush, Material Save 4 and gains 1000 DP per 2 digivolution cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT11-019", as: "shoutmon", under: ["BT1-001", "BT1-009", "BT1-010", "BT1-011"] }],
      },
    });

    await advance(s.engine).recompute();

    expect(observe(s.engine).hasKeyword(s.perm("shoutmon"), "Rush")).toBe(true);
    expect(observe(s.engine).keywordAmount(s.perm("shoutmon"), "MaterialSave")).toBe(4);
    expect(s.perm("shoutmon").currentDP).toBe(15000);
  });

  it("deletes an opponent's Digimon with DP no greater than its own", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT11-019", as: "shoutmon" }] },
        1: {
          battleArea: [
            { card: "BT1-028", as: "deletable", dp: 13000 },
            { card: "BT1-029", as: "tooLarge", dp: 14000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 20;
    const deletableInstanceId = s.perm("deletable").topCard.instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("shoutmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some(({ instanceId }) => instanceId === deletableInstanceId));

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("tooLarge").permanentId,
    );
  });
});
