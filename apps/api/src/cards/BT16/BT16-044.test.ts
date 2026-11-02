import { describe, expect, it } from "vitest";
import { digivolutionRequirementsFor } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT16-044.js";
import "../index.js";

describe("BT16-044", () => {
  it("locks an already suspended Digimon while resolving both three-security effects", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT16-044", as: "pistmon" }], security: 3 },
        1: { battleArea: [{ card: "BT1-009", as: "opponent", suspended: true }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pistmon").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.perm("opponent").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("opponent"), "unsuspendDuringOwnUnsuspendPhase")).toBe(true);
    expect(s.state.memory).toBe(2);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("suspends and restricts the same selected opponent Digimon", () => {
    for (const effect of compiled.effects?.slice(0, 2) ?? []) {
      expect(effect.actions?.[0]).toMatchObject({
        kind: "SelectBind",
        target: { bindAs: "suspended", filter: { kind: ["Digimon"] } },
        condition: { kind: "securityAtLeast", value: 3 },
      });
      expect(effect.actions?.[1]).toMatchObject({ kind: "Suspend", target: { fromSelectionRef: "suspended" } });
      expect(effect.actions?.[2]).toMatchObject({
        kind: "Restrict",
        target: { fromSelectionRef: "suspended" },
        restriction: "unsuspendDuringOwnUnsuspendPhase",
        duration: "untilOpponentNextUnsuspendPhase",
      });
      expect(effect.actions?.[3]).toMatchObject({
        kind: "GainMemory",
        amount: 2,
        condition: { kind: "zoneCount", value: 3 },
      });
    }
  });

  it("gains memory at three security even without an opposing Digimon to suspend", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT16-044", as: "pistmon" }], security: 3 } },
      { autoSelectCards: true },
    );
    s.state.memory = 6;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pistmon").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT16-044")).toBe(true);
  });

  it("has the inherited Pulsemon security-cost unsuspend", () => {
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "EndOfAttack",
      isInherited: true,
      frequency: "OncePerTurn",
    });
    expect(compiled.effects?.[2]?.actions?.[0]).toMatchObject({
      kind: "Unsuspend",
      optional: true,
      abortOnDecline: true,
      cost: { kind: "trash" },
    });
    expect(digivolutionRequirementsFor("BT16-044")).toEqual([
      { level: 4, texts: ["Pulsemon"], cost: 3, isAlternate: true },
    ]);
  });

  it("suspends and restricts the same opponent at exactly three security", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT16-044", as: "pistmon" }], security: ["BT1-009", "BT1-009", "BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 6;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pistmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("opponent").isSuspended && s.state.memory === 2);

    expect(s.perm("opponent").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("opponent"), "unsuspendDuringOwnUnsuspendPhase")).toBe(true);
    expect(s.state.memory).toBe(2);
  });

  it("resolves both independent branches when digivolving at exactly three security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-043", as: "base" }],
          hand: [{ card: "BT16-044", as: "pistmon" }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 6;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pistmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT16-044");

    expect(s.state.memory).toBe(5);
    expect(s.perm("opponent").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("opponent"), "unsuspendDuringOwnUnsuspendPhase")).toBe(true);
  });

  it("locks the chosen already suspended Digimon without suspending a different Digimon", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT16-044", as: "pistmon" }], security: ["BT1-009", "BT1-009", "BT1-009"] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "alreadySuspended", suspended: true },
            { card: "BT1-009", as: "unsuspended" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 6;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pistmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.memory === 2);

    expect(observe(s.engine).isRestricted(s.perm("alreadySuspended"), "unsuspendDuringOwnUnsuspendPhase")).toBe(true);
    expect(s.perm("unsuspended").isSuspended).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("unsuspended"), "unsuspendDuringOwnUnsuspendPhase")).toBe(false);
  });

  it("naturally pays the inherited security cost and unsuspends after attacking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-047", as: "host", under: ["BT16-044"], suspended: false }],
          security: ["BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-090"] },
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
    await settle(() => !s.perm("host").isSuspended);

    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });
});

describe("BT16-044 Pistmon — KB Q&A rulings", () => {
  it("activates both the suspend-and-lock and the gain 2 memory clauses with exactly 3 security cards (Q2636)", async () => {
    async function playPistmonWithSecurity(securityCount: number) {
      const s = setupEngine(
        {
          0: { hand: [{ card: "BT16-044", as: "pistmon" }], security: securityCount },
          1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
        },
        { autoSelectCards: true },
      );
      s.state.memory = 6;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pistmon").instanceId })).toEqual({
        ok: true,
      });
      await settle();
      return s;
    }

    const exactlyThree = await playPistmonWithSecurity(3);
    expect(exactlyThree.perm("opponent").isSuspended).toBe(true);
    expect(
      observe(exactlyThree.engine).isRestricted(exactlyThree.perm("opponent"), "unsuspendDuringOwnUnsuspendPhase"),
    ).toBe(true);
    expect(exactlyThree.state.memory).toBe(2);

    const two = await playPistmonWithSecurity(2);
    expect(two.perm("opponent").isSuspended).toBe(false);
    expect(observe(two.engine).isRestricted(two.perm("opponent"), "unsuspendDuringOwnUnsuspendPhase")).toBe(false);
    expect(two.state.memory).toBe(2);
  });
});
