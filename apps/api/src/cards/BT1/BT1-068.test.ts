import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-068.js";

describe("BT1-068 Kokuwamon", () => {
  it("matches the catalog and exact inherited IR contract", () => {
    expect(getCardDefinition("BT1-068")).toMatchObject({
      cardId: "BT1-068",
      nameEn: "Kokuwamon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 4,
      dp: 2000,
      evoCosts: [{ color: "Green", level: 2, memoryCost: 1 }],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Machine"],
      inheritedEffectText:
        "[Your Turn] While this Digimon is level 6 or higher, it gains ＜Security Attack +1＞. (This Digimon checks 1 additional security card.)",
    });
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "YourTurn",
          isInherited: true,
          actions: [
            {
              kind: "GainKeyword",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              keyword: { keyword: "SecurityAttack", amount: 1 },
              duration: "forTheTurn",
              condition: { kind: "selfLevelAtLeast", value: 6 },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gives Security Attack +1 while its Digimon is level 6 or higher during its turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-081", as: "host", under: ["BT1-068", "BT1-074", "BT1-075"] }] },
    });
    await s.ready();
    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(1);
  });

  it("still grants exactly Security Attack +1 at level 7", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT12-057", as: "host", under: ["BT1-068", "BT1-074", "BT1-075", "BT1-081"] }],
      },
    });
    await s.ready();

    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(1);
  });

  it("does not grant Security Attack +1 below level 6", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-075", as: "host", under: ["BT1-068", "BT1-074"] }] },
    });
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "SecurityAttack")).toBe(false);
  });

  it("does not grant Security Attack +1 during the opponent's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-081", as: "host", under: ["BT1-068", "BT1-074", "BT1-075"] }] },
    });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "SecurityAttack")).toBe(false);
  });

  it("does not grant Security Attack while Kokuwamon is the top card", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-068", as: "kokuwamon" }] } });
    await s.ready();

    expect(observe(s.engine).keywordAmount(s.perm("kokuwamon"), "SecurityAttack")).toBe(0);
  });

  it("digivolves legally from a green level 2 for 1 memory and preserves the source stack", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT1-007", as: "base" },
        hand: [{ card: "BT1-068", as: "kokuwamon" }],
        deck: [{ card: "BT1-010", as: "drawn" }],
      },
    });
    s.state.memory = 1;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.state.players[0]!.breeding!.permanentId,
        instanceId: s.inst("kokuwamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await s.engine.recomputeContinuousEffects();

    expect(s.state.players[0]!.breeding!.topCard?.instanceId).toBe(s.inst("kokuwamon").instanceId);
    expect(s.state.players[0]!.breeding!.stack.map((card) => card.cardId)).toEqual(["BT1-007"]);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
    expect(observe(s.engine).hasKeyword(s.state.players[0]!.breeding!, "SecurityAttack")).toBe(false);
  });

  it("rejects evolution from a non-green level 2", () => {
    const s = setupEngine({
      0: { breeding: { card: "BT1-001", as: "redBase" }, hand: [{ card: "BT1-068", as: "kokuwamon" }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.state.players[0]!.breeding!.permanentId,
        instanceId: s.inst("kokuwamon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});
