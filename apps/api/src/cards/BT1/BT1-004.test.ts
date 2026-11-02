import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-004.js";
import "./BT1-028.js";

describe("BT1-004 Wanyamon", () => {
  it("matches the catalog and preserves its only inherited clause in IR", async () => {
    expect(getCardDefinition("BT1-004")).toMatchObject({
      cardId: "BT1-004",
      nameEn: "Wanyamon",
      colors: ["Blue"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      dp: 0,
      evoCosts: [],
      forms: ["In-Training"],
      types: ["Lesser"],
      inheritedEffectText:
        "[Your Turn] While your opponent has 2 or more Digimon with no digivolution cards in play, this Digimon gets +2000 DP.",
    });
    expect(getCardDefinition("BT1-004")?.effectText).toBeUndefined();
    expect(compiled.effects).toEqual([
      {
        trigger: "YourTurn",
        isInherited: true,
        actions: [
          {
            kind: "ModifyDP",
            amount: 2000,
            duration: "forTheTurn",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            condition: {
              kind: "opponentHas",
              countMin: 2,
              filter: { kind: ["Digimon"], zone: "battleArea", digivolutionCards: "none" },
            },
          },
        ],
      },
    ]);
  });

  it("gives +2000 DP while the opponent has at least two source-less Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-032", as: "host", dp: 5000, under: ["BT1-004"] }] },
      1: { battleArea: ["BT1-016", "BT1-017"] },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(7000);
  });

  it("does not give +2000 DP with only one source-less opposing Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-032", as: "host", dp: 5000, under: ["BT1-004"] }] },
      1: { battleArea: ["BT1-016"] },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("does not give +2000 DP during the opponent's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-032", as: "host", dp: 5000, under: ["BT1-004"] }] },
      1: { battleArea: ["BT1-016", "BT1-017"] },
    });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("does not count source-less Digimon in the opponent's breeding area", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-032", as: "host", dp: 5000, under: ["BT1-004"] }] },
      1: { battleArea: ["BT1-016"], breeding: "BT1-017" },
    });
    await s.ready();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("counts only the two source-less battle-area peers among a mixed board", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-032", as: "host", dp: 5000, under: ["BT1-004"] }] },
      1: {
        battleArea: [
          { card: "BT1-016", as: "firstSourceLess" },
          { card: "BT1-017", as: "secondSourceLess" },
          { card: "BT1-019", as: "sourced", under: ["BT1-009"] },
        ],
      },
    });
    await s.ready();

    expect(s.perm("host").currentDP).toBe(7000);
  });

  it("carries the exact two-peer boundary through hatch, legal breeding digivolution, draw, stack, and move", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-004", as: "egg" }],
          hand: [{ card: "BT1-028", as: "elecmon" }],
          deck: [{ card: "BT1-010", as: "drawn" }, "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-016", as: "firstSourceLess" },
            { card: "BT1-017", as: "secondSourceLess" },
            { card: "BT1-019", as: "sourced", under: ["BT1-009"] },
          ],
          security: [],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-004");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const permanentId = s.state.players[0]!.breeding!.permanentId;
    expect(s.state.players[0]!.eggDeck).toHaveLength(0);

    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 1;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId,
        instanceId: s.inst("elecmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-028");
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("drawn").instanceId);
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    await advance(s.engine).waitForMainPhase(0);

    const carrier = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT1-028")!;
    expect(carrier.topCard?.cardId).toBe("BT1-028");
    expect(carrier.stack.map(({ cardId }) => cardId)).toEqual(["BT1-004"]);
    expect(carrier.currentDP).toBe(5000);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(carrier.currentDP).toBe(3000);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    await advance(s.engine).waitForMainPhase(0);
    expect(carrier.currentDP).toBe(5000);

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("BT1-004 Wanyamon — KB Q&A rulings", () => {
  it("does not count a source-less Digimon in the opponent's breeding area toward the two required (Q869)", async () => {
    const breeding = setupEngine({
      0: { battleArea: [{ card: "BT1-032", as: "host", dp: 5000, under: ["BT1-004"] }] },
      1: { battleArea: ["BT1-016"], breeding: "BT1-017" },
    });
    await breeding.ready();
    expect(breeding.perm("host").currentDP).toBe(5000);

    const battleArea = setupEngine({
      0: { battleArea: [{ card: "BT1-032", as: "host", dp: 5000, under: ["BT1-004"] }] },
      1: { battleArea: ["BT1-016", "BT1-017"] },
    });
    await battleArea.ready();
    expect(battleArea.perm("host").currentDP).toBe(7000);
  });
});
