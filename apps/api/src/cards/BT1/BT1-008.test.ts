import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-008.js";

describe("BT1-008 Frimon", () => {
  it("matches the catalog and exports only its inherited suspended-Digimon effect", () => {
    expect(getCardDefinition("BT1-008")).toMatchObject({
      cardId: "BT1-008",
      nameEn: "Frimon",
      colors: ["Green"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      dp: 0,
      evoCosts: [],
      forms: ["In-Training"],
      types: ["Lesser"],
      inheritedEffectText:
        "[Your Turn] While your opponent has 2 or more suspended Digimon in play, this Digimon gets +2000 DP.",
    });
    expect(getCardDefinition("BT1-008")?.effectText).toBeUndefined();
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
              filter: { kind: ["Digimon"], zone: "battleArea", suspended: true },
            },
          },
        ],
      },
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("gives +2000 DP while the opponent has at least two suspended Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-075", as: "host", dp: 5000, under: ["BT1-008"] }] },
      1: {
        battleArea: [
          { card: "BT1-016", suspended: true },
          { card: "BT1-017", suspended: true },
        ],
      },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(7000);
  });

  it("does not give +2000 DP with only one suspended opposing Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-075", as: "host", dp: 5000, under: ["BT1-008"] }] },
      1: { battleArea: [{ card: "BT1-016", suspended: true }, "BT1-017"] },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("does not give +2000 DP during the opponent's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-075", as: "host", dp: 5000, under: ["BT1-008"] }] },
      1: {
        battleArea: [
          { card: "BT1-016", suspended: true },
          { card: "BT1-017", suspended: true },
        ],
      },
    });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("does not count a suspended Digimon in the opponent's breeding area", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-075", as: "host", dp: 5000, under: ["BT1-008"] }] },
      1: {
        battleArea: [{ card: "BT1-016", suspended: true }],
        breeding: { card: "BT1-017", suspended: true },
      },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("carries the inherited DP boost through hatch -> breeding digivolve -> move beside a peer", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-008", as: "egg" }],
          battleArea: [{ card: "BT1-068", as: "peer", dp: 4000 }],
          hand: [{ card: "BT1-068", as: "kokuwamon" }],
          deck: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-016", "BT1-017", "BT1-018"],
          security: ["BT1-010", "BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-016", as: "firstSuspended", suspended: true },
            { card: "BT1-017", as: "secondSuspended", suspended: true },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
          security: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-008");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const eggPermanentId = s.state.players[0]!.breeding!.permanentId;

    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eggPermanentId,
        instanceId: s.inst("kokuwamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-068");
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: eggPermanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("firstSuspended").permanentId, s.perm("secondSuspended").permanentId]);
    const carrier = s.state.players[0]!.battleArea.find(({ stack }) =>
      stack.some(({ instanceId }) => instanceId === eggInstanceId),
    )!;
    expect(carrier.topCard?.cardId).toBe("BT1-068");
    expect(carrier.currentDP).toBe(carrier.baseDP + 2000);
    expect(s.perm("peer").currentDP).toBe(s.perm("peer").baseDP);
    expect(s.state.pendingDecision).toBeUndefined();

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
