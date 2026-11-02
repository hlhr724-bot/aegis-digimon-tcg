import { EffectTiming, Phase, getCardDefinition, type Seat } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./BT1-031.js";
import "./BT1-072.js";
import { compiled } from "./BT1-113.js";

async function unsuspendForActivePhase(engine: Parameters<typeof observe>[0], seat: Seat): Promise<string[]> {
  return (engine as unknown as { unsuspendForActivePhase(seat: Seat): Promise<string[]> }).unsuspendForActivePhase(
    seat,
  );
}

describe("BT1-113 Forbidden Temptation", () => {
  it("matches the catalog and preserves both Main and Security clauses", () => {
    expect(getCardDefinition("BT1-113")).toMatchObject({
      cardId: "BT1-113",
      set: "BT1",
      nameEn: "Forbidden Temptation",
      colors: ["Green"],
      kinds: ["Option"],
      playCost: 4,
      dp: 0,
      evoCosts: [],
      effectText:
        "[Main] Until the end of your opponent's next turn, 1 of your opponent's Digimon can't attack or block.",
      securityEffectText: "[Security] Your opponent's Digimon don't unsuspend during their next unsuspend phase.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-113",
      nameJp: "フォービドゥンテンプテイション",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Until the end of your opponent's next turn, 1 of your opponent's Digimon can't attack or block.",
            kind: "Restrict",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            restriction: "attack",
            duration: "untilOpponentTurnEnd",
          },
          {
            effectTextPart:
              "[Main] Until the end of your opponent's next turn, 1 of your opponent's Digimon can't attack or block.",
            kind: "Restrict",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1, sameTarget: true },
            restriction: "block",
            duration: "untilOpponentTurnEnd",
          },
        ],
      },
      {
        trigger: "Security",
        actions: [
          {
            kind: "Restrict",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
            restriction: "unsuspend",
            duration: "untilOpponentNextUnsuspendPhase",
            whileMatchesTargetFilter: true,
          },
        ],
      },
    ]);
  });

  it("prevents one opposing Digimon from attacking and blocking", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-067", as: "attacker", dp: 10000 }], hand: [{ card: "BT1-113", as: "option" }] },
        1: {
          battleArea: [
            { card: "BT1-031", as: "target" },
            { card: "BT1-072", as: "otherBlocker" },
          ],
          deck: ["BT1-010"],
          security: ["BT1-010"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        observe(s.engine).isRestricted(s.perm("target"), "attack") &&
        observe(s.engine).isRestricted(s.perm("target"), "block"),
    );

    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });

    s.state.turnSeat = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).blockingSeat() === 1);
    expect(s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("target").permanentId })).toEqual(
      { ok: false, reason: "illegal-target" },
    );
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("otherBlocker").permanentId }),
    ).toEqual({ ok: true });
  });

  it("prevents every opposing Digimon from unsuspending in the next unsuspend phase", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT1-113", as: "securityOption", faceUp: true }] },
      1: {
        battleArea: [
          { card: "BT1-010", as: "first", suspended: true },
          { card: "BT1-015", as: "second", suspended: true },
        ],
      },
    });
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    expect(observe(s.engine).isRestricted(s.perm("first"), "unsuspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("second"), "unsuspend")).toBe(true);
  });

  it("keeps the Main attack/block lock through the opponent's next turn and then expires", async () => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT1-067"], hand: [{ card: "BT1-113", as: "option" }], deck: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-010", as: "target" }], deck: ["BT1-011"] },
      },
      { autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "attack"));
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(true);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(false);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("Security restriction survives the current opponent turn and blocks their next unsuspend phase", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT1-113", as: "securityOption" }, "BT1-009", "BT1-010"],
        deck: ["BT1-011"],
      },
      1: {
        battleArea: [
          { card: "BT1-015", as: "first" },
          { card: "BT1-016", as: "second" },
        ],
        deck: ["BT1-011", "BT1-012"],
      },
    });
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("first").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 2 && !observe(s.engine).isAttacking());
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("second").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.perm("second").isSuspended);
    expect(observe(s.engine).isRestricted(s.perm("first"), "unsuspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("second"), "unsuspend")).toBe(true);

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("first"), "unsuspend")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("second"), "unsuspend")).toBe(false);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("resolves Security from a real attack and restricts every opposing Digimon", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT1-113", as: "securityOption" }], deck: ["BT1-009"] },
      1: {
        battleArea: [
          { card: "BT1-010", as: "attacker" },
          { card: "BT1-015", as: "first" },
          { card: "BT1-016", as: "second" },
        ],
        deck: ["BT1-011", "BT1-012"],
      },
    });
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0 && !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT1-113");
    expect(observe(s.engine).isRestricted(s.perm("first"), "unsuspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("second"), "unsuspend")).toBe(true);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("Q988 keeps the attack and block restrictions on the permanent after it digivolves", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-067", as: "attacker", dp: 10000 }],
          hand: [{ card: "BT1-113", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT1-064", as: "target" },
            { card: "BT1-072", as: "otherBlocker" },
          ],
          hand: [{ card: "BT1-072", as: "evolution" }],
          deck: ["BT1-010"],
          security: ["BT1-010"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "attack"));

    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("target").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard.cardId === "BT1-072");

    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(true);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });

    s.state.turnSeat = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).blockingSeat() === 1);
    expect(s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("target").permanentId })).toEqual(
      { ok: false, reason: "illegal-target" },
    );
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("otherBlocker").permanentId }),
    ).toEqual({ ok: true });
  });

  it("Q989 prevents opposing Digimon but not opposing Tamers from unsuspending", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT1-113", as: "securityOption", faceUp: true }] },
      1: {
        battleArea: [
          { card: "BT1-010", as: "digimon", suspended: true },
          { card: "BT1-087", as: "tamer", suspended: true },
        ],
      },
    });
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    s.state.turnSeat = 1;
    s.state.phase = Phase.Active;

    await unsuspendForActivePhase(s.engine, 1);

    expect(s.perm("digimon").isSuspended).toBe(true);
    expect(s.perm("tamer").isSuspended).toBe(false);
  });

  it("CR 15-11-2-2: Security also stops an opposing Digimon that entered after it resolved", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT1-113", as: "securityOption", faceUp: true }] },
      1: { battleArea: [{ card: "BT1-010", as: "present", suspended: true }] },
    });
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    const late = s.putOnBoard(1, { card: "BT1-015", suspended: true });
    s.state.turnSeat = 1;
    s.state.phase = Phase.Active;

    await unsuspendForActivePhase(s.engine, 1);

    expect(s.perm("present").isSuspended).toBe(true);
    expect(late.isSuspended).toBe(true);
  });
});
