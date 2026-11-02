import { describe, expect, it } from "vitest";
import { Phase, type PlayerState } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";

describe("BT19-001 Pickmons", () => {
  it("places only a qualifying Digimon from hand under a Tamer and draws", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-007", as: "host", under: ["BT19-001"] },
            { card: "BT19-081", as: "tamer" },
          ],
          hand: ["BT19-081", "BT19-067", "BT19-016", "BT19-016"],
          deck: [{ card: "BT1-009", as: "deckTop" }, "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.some((card) => card.cardId === "BT19-016"));

    expect(s.perm("tamer").stack.some((card) => card.cardId === "BT19-016")).toBe(true);
    expect(s.perm("tamer").stack.some((card) => card.cardId === "BT19-081")).toBe(false);
    expect((s.state.players[0] as PlayerState).hand.some((card) => card.cardId === "BT19-067")).toBe(true);
    expect(
      (s.state.players[0] as PlayerState).hand.some(({ instanceId }) => instanceId === s.inst("deckTop").instanceId),
    ).toBe(true);

    const stackAfterFirstAttack = s.perm("tamer").stack.length;
    const handAfterFirstAttack = (s.state.players[0] as PlayerState).hand.length;
    await advance(s.engine).verb.unsuspend([s.perm("host").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => false, 20);

    expect(s.perm("tamer").stack).toHaveLength(stackAfterFirstAttack);
    expect((s.state.players[0] as PlayerState).hand).toHaveLength(handAfterFirstAttack);
  });

  it("may decline the placement cost and does not draw", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-007", as: "host", under: ["BT19-001"] },
            { card: "BT19-081", as: "tamer" },
          ],
          hand: ["BT19-016"],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );

    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => false, 20);

    expect(s.perm("tamer").stack).toHaveLength(0);
    expect((s.state.players[0] as PlayerState).hand.map((card) => card.cardId)).toEqual(["BT19-016"]);
  });
  it("carries the inherited draw through the real Digi-Egg route and is once per turn", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT19-001", as: "egg" }],
          battleArea: [{ card: "BT1-088", as: "tamer" }],
          hand: [
            { card: "BT3-009", as: "hawkmon" },
            { card: "BT10-007", as: "xrosCard" },
            { card: "BT10-007", as: "xrosCardB" },
            { card: "BT19-067", as: "offTraitCard" },
          ],
          deck: ["BT1-012", "BT1-013", "BT1-009", "BT1-014", "BT1-012", "BT1-013"],
          security: ["BT1-009", "BT1-013"],
        },
        1: {
          deck: ["BT1-009", "BT1-013", "BT1-012", "BT1-014", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          hand: [{ card: "BT1-009", as: "opponentSpare" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.inst("offTraitCard").instanceId);
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT19-001");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const eggPermanentId = s.state.players[0]!.breeding!.permanentId;
    expect(s.state.players[0]!.eggDeck).toHaveLength(0);

    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eggPermanentId,
        instanceId: s.inst("hawkmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT3-009");
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([s.perm("tamer").permanentId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: eggPermanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    const carrier = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT3-009")!;
    expect(carrier.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    await advance(s.engine).waitForMainPhase(0);
    const handBeforeAttack = s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
    const deckTopInstanceId = s.state.players[0]!.deck[0]!.instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: carrier.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.length === 1);

    expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("xrosCard").instanceId]);
    expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("offTraitCard").instanceId)).toBe(
      true,
    );
    const drawn = s.state.players[0]!.hand.filter(({ instanceId }) => !handBeforeAttack.includes(instanceId));
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.instanceId).toBe(deckTopInstanceId);

    const handAfterFirstAttack = s.state.players[0]!.hand.length;
    await advance(s.engine).verb.unsuspend([carrier.permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: carrier.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("tamer").stack).toHaveLength(1);
    expect(s.state.players[0]!.hand).toHaveLength(handAfterFirstAttack);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);

    await advance(s.engine).waitForMainPhase(0);
    const handBeforeReset = s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: carrier.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.length === 2);

    expect(
      s
        .perm("tamer")
        .stack.map(({ instanceId }) => instanceId)
        .sort(),
    ).toEqual([s.inst("xrosCard").instanceId, s.inst("xrosCardB").instanceId].sort());
    expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("offTraitCard").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.hand.filter(({ instanceId }) => !handBeforeReset.includes(instanceId))).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
  it("does nothing when there is no Tamer to place the card under", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-007", as: "host", under: ["BT19-001"] }],
          hand: [{ card: "BT10-007", as: "xrosCard" }],
          deck: ["BT1-009", "BT1-013"],
        },
        1: { security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "securityChecked"));

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("xrosCard").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
