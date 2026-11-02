import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-005.js";

describe("BT1-005 Kyaromon", () => {
  it("matches the catalog and exports only its inherited security-count effect", () => {
    expect(getCardDefinition("BT1-005")).toMatchObject({
      cardId: "BT1-005",
      nameEn: "Kyaromon",
      colors: ["Yellow"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      dp: 0,
      evoCosts: [],
      forms: ["In-Training"],
      types: ["Lesser"],
      inheritedEffectText: "[Your Turn] While you have 6 or more security cards, this Digimon gets +2000 DP.",
    });
    expect(getCardDefinition("BT1-005")?.effectText).toBeUndefined();
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
            condition: { kind: "zoneCount", seat: "mine", zone: "security", op: "gte", value: 6 },
          },
        ],
      },
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("gives +2000 DP while its controller has at least six security cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "host", dp: 5000, under: ["BT1-005"] }],
        security: ["BT1-045", "BT1-045", "BT1-045", "BT1-045", "BT1-045", "BT1-045"],
      },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(7000);
  });

  it("does not give +2000 DP with only five security cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "host", dp: 5000, under: ["BT1-005"] }],
        security: ["BT1-045", "BT1-045", "BT1-045", "BT1-045", "BT1-045"],
      },
    });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("does not give +2000 DP during the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-052", as: "host", dp: 5000, under: ["BT1-005"] }],
        security: ["BT1-045", "BT1-045", "BT1-045", "BT1-045", "BT1-045", "BT1-045"],
      },
    });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("carries the inherited DP boost through hatch -> breeding digivolve -> move beside a peer", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-005", as: "egg" }],
          battleArea: [{ card: "BT1-045", as: "peer", dp: 3000 }],
          hand: [{ card: "BT1-045", as: "tsukaimon" }],
          deck: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-016"],
          security: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-016"],
        },
        1: {
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          security: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-005");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const eggPermanentId = s.state.players[0]!.breeding!.permanentId;

    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eggPermanentId,
        instanceId: s.inst("tsukaimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-045");
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: eggPermanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    await advance(s.engine).waitForMainPhase(0);
    const carrier = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard?.cardId === "BT1-045" && topCard.instanceId !== s.perm("peer").topCard!.instanceId,
    )!;
    expect(carrier.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);
    expect(carrier.currentDP).toBe(carrier.baseDP + 2000);
    expect(s.perm("peer").currentDP).toBe(s.perm("peer").baseDP);

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
