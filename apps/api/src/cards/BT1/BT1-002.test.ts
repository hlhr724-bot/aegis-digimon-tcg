import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-002.js";
import "./BT1-022.js";
import "./BT1-091.js";
import "../BT6/BT6-010.js";
import "../BT2/BT2-088.js";

describe("BT1-002 Bebydomon", () => {
  it("matches the catalog and preserves its only inherited clause in IR", () => {
    expect(getCardDefinition("BT1-002")).toMatchObject({
      cardId: "BT1-002",
      nameEn: "Bebydomon",
      colors: ["Red"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      dp: 0,
      evoCosts: [],
      forms: ["In-Training"],
      types: ["Baby Dragon"],
      inheritedEffectText: "[Your Turn] While this Digimon has ＜Piercing＞, it gets +2000 DP.",
    });
    expect(getCardDefinition("BT1-002")?.effectText).toBeUndefined();
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
            condition: { kind: "selfHasKeyword", keyword: "Piercing" },
          },
        ],
      },
    ]);
  });

  it("gives +2000 DP while its Digimon has Piercing during its turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-022", as: "host", dp: 5000, under: ["BT1-002"] }] } });
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(7000);
  });

  it("does not give +2000 DP during the opponent's turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-022", as: "host", dp: 5000, under: ["BT1-002"] }] } });
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(5000);
  });

  it("gives +2000 DP when Piercing is granted by an Option card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-010", as: "host", dp: 2000, under: ["BT1-002"] }],
          hand: [{ card: "BT1-091", as: "scrapClaw" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("scrapClaw").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").currentDP === 4000);

    expect(s.perm("host").currentDP).toBe(4000);
  });

  it("recognizes Piercing granted by a Tamer (Q867)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT2-088", as: "taiga" },
          { card: "BT2-044", as: "host", under: ["BT1-002"] },
        ],
      },
    });
    await s.ready();

    expect(observe(s.engine).hasPierce(s.perm("host"))).toBe(true);
    expect(s.perm("host").currentDP).toBe(6000);
  });

  it("does not give DP to a source-less host, even beside a Piercing peer", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT1-013", as: "sourceLess", under: ["BT1-002"] },
          { card: "BT1-022", as: "piercingPeer" },
        ],
      },
    });
    await s.ready();

    expect(observe(s.engine).hasPierce(s.perm("sourceLess"))).toBe(false);
    expect(s.perm("sourceLess").currentDP).toBe(5000);
    expect(s.perm("piercingPeer").currentDP).toBe(7000);
  });

  it("carries the inherited boost through hatch, legal breeding digivolution, draw, and move", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-002", as: "egg" }],
          battleArea: [{ card: "BT2-088", as: "taiga" }],
          hand: [
            { card: "BT6-010", as: "flamemon" },
            { card: "BT1-016", as: "tyrannomon" },
          ],
          deck: [{ card: "BT1-009", as: "breedingDrawn" }, { card: "BT1-010", as: "battleDrawn" }, "BT1-011"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-013", as: "target", dp: 5000, suspended: true }],
          security: [],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-002");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const breedingPermanentId = s.state.players[0]!.breeding!.permanentId;
    expect(s.state.players[0]!.eggDeck).toHaveLength(0);

    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 1;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: breedingPermanentId,
        instanceId: s.inst("flamemon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT6-010");
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("breedingDrawn").instanceId);
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);

    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: breedingPermanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    const carrier = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT6-010")!;
    expect(carrier.topCard?.cardId).toBe("BT6-010");
    expect(carrier.stack.map(({ cardId }) => cardId)).toEqual(["BT1-002"]);

    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: carrier.permanentId,
        instanceId: s.inst("tyrannomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT1-016"));
    const evolvedCarrier = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT1-016")!;
    // Tyrannomon costs 2 to digivolve from a red level 3.
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("battleDrawn").instanceId);
    expect(evolvedCarrier.stack.map(({ cardId }) => cardId)).toEqual(["BT1-002", "BT6-010"]);
    expect(evolvedCarrier.topCard?.cardId).toBe("BT1-016");
    expect(observe(s.engine).hasPierce(evolvedCarrier)).toBe(true);
    expect(evolvedCarrier.currentDP).toBe(6000);

    await advance(s.engine).verb.suspend([s.perm("target").permanentId]);
    const targetInstanceId = s.perm("target").topCard!.instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: evolvedCarrier.permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some(({ instanceId }) => instanceId === targetInstanceId));
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === evolvedCarrier.permanentId)).toBe(
      true,
    );
    expect(evolvedCarrier.currentDP).toBe(6000);

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
