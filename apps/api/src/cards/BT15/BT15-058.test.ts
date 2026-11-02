import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT15-058.js";
import "../index.js";

describe("BT15-058", () => {
  it.each([
    ["BT15-056", false],
    ["BT15-087", true],
  ])("requires a DigiPolice Tamer rather than a Digimon for its evolution bonus: %s", async (source, allowed) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-055", as: "host", under: [{ card: source, faceUp: true }] }],
          hand: [{ card: "BT15-058", as: "evolution" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", suspended: false }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT15-058" && s.state.pendingDecision === undefined);
    await drainMicrotasks();
    expect(observe(s.engine).hasRestriction(s.perm("target"), "unsuspend")).toBe(allowed);
  });

  it("matches the catalog identity and black/green level-4 evolution routes", () => {
    expect(getCardDefinition("BT15-058")).toMatchObject({
      nameEn: "Ginryumon",
      colors: ["Black", "Green"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 4000,
      evoCosts: [
        { color: "Black", level: 3, memoryCost: 3 },
        { color: "Green", level: 3, memoryCost: 3 },
      ],
      types: ["Beast Dragon", "X Antibody", "DigiPolice"],
    });
  });

  it("retains inherited Blocker", () =>
    expect(compiled.effects?.[0]).toMatchObject({ trigger: "Static", keywords: [{ keyword: "Blocker" }] }));
  it("binds and suspends one opposing Digimon, then restricts that same target with DigiPolice in stack", () => {
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "OnPlay",
      actions: [
        { kind: "SelectBind", target: { bindAs: "suspended", filter: { kind: ["Digimon"] } } },
        { kind: "Suspend", target: { fromSelectionRef: "suspended" } },
        {
          kind: "Restrict",
          target: { fromSelectionRef: "suspended" },
          restriction: "unsuspend",
          condition: { kind: "selfDigivolutionStackHasTrait" },
        },
      ],
    });
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [{ kind: "SelectBind" }, { kind: "Suspend" }, { kind: "Restrict" }],
    });
  });
  it("once per turn suspends an opposing Digimon or Tamer when this is suspended", () =>
    expect(compiled.effects?.[3]).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [{ kind: "Suspend", target: { filter: { playCostLteTriggerSource: true } } }],
        },
      ],
    }));

  it("naturally suspends and restricts the selected Digimon when DigiPolice is in its stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-055", as: "base", under: ["BT14-086"] }],
          hand: [{ card: "BT15-058", as: "ginryumon" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("ginryumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT15-058");

    expect(s.perm("target").isSuspended).toBe(true);
    expect(observe(s.engine).hasRestriction(s.perm("target"), "unsuspend")).toBe(true);
  });

  it("naturally fires the inherited ceiling only when its own host suspends", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-063", as: "host", under: ["BT15-058"] }],
          hand: [{ card: "BT1-009", as: "spare" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "low" },
            { card: "BT1-019", as: "high" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true, preferInstanceIds },
    );

    preferInstanceIds.push(s.perm("low").topCard!.instanceId);
    s.state.memory = 3;
    await s.ready();
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("low").isSuspended &&
        !observe(s.engine).isAttacking() &&
        s.state.pendingDecision === undefined &&
        s.state.players[1]!.security.length === 4,
    );

    expect(s.perm("host").isSuspended).toBe(true);
    expect(s.perm("low").isSuspended).toBe(true);
    expect(s.perm("high").isSuspended).toBe(false);

    await advance(s.engine).verb.unsuspend([s.perm("host").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() &&
        s.state.pendingDecision === undefined &&
        s.state.players[1]!.security.length === 3,
    );
    expect(s.perm("high").isSuspended).toBe(false);

    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.unsuspend([
      s.perm("host").permanentId,
      s.perm("low").permanentId,
      s.perm("high").permanentId,
    ]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("low").isSuspended);
    expect(s.perm("low").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
    expect(s.state.turnCount).toBeGreaterThan(1);
  });
});

describe("BT15-058 Ginryumon — KB Q&A rulings", () => {
  it("keeps the suspended Digimon locked through the opponent's turn after the DigiPolice Tamer leaves the digivolution cards (Q2542)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-055", as: "base", under: [{ card: "BT14-086", as: "police" }] }],
          hand: [{ card: "BT15-058", as: "ginryumon" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "target" },
            { card: "BT1-009", as: "alreadySuspended", suspended: true },
          ],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await s.ready();
    s.state.memory = 10;
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("ginryumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard?.cardId === "BT15-058" &&
        s.perm("target").isSuspended &&
        s.state.pendingDecision === undefined,
    );
    expect(observe(s.engine).hasRestriction(s.perm("target"), "unsuspend")).toBe(true);

    await advance(s.engine).verb.trashDigivolutionCards(s.perm("base").permanentId, [s.inst("police").instanceId], 0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).not.toContain("BT14-086");
    expect(observe(s.engine).hasRestriction(s.perm("target"), "unsuspend")).toBe(true);

    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await advance(s.engine).runTurn(1);

    expect(s.perm("alreadySuspended").isSuspended).toBe(false);
    expect(s.perm("target").isSuspended).toBe(true);
  });
});
