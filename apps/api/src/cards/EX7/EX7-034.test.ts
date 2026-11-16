import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { hasRegisteredCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX7-034.js";
import "../index.js";

async function stopLoop(s: ReturnType<typeof setupEngine>, loop: Promise<void>, seat: 0 | 1): Promise<void> {
  if (!s.state.gameOver && !s.engine.applyIntent(seat, { type: "surrender" }).ok)
    throw new Error("failed to stop loop");
  await loop;
}

describe("EX7-034 GrandGalemon", () => {
  it("matches the catalog, complete IR, and exclusive compiled registration", () => {
    expect(getCardDefinition("EX7-034")).toMatchObject({
      cardId: "EX7-034",
      nameEn: "GrandGalemon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [{ color: "Green", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Data"],
      types: ["Bird Dragon", "Vortex Warriors", "LIBERATOR"],
      effectText:
        "＜Vortex＞ (At the end of your turn, this Digimon may attack an opponent's Digimon. With this effect, it can attack the turn it was played)\n[When Digivolving] You may suspend 1 Digimon. If this effect suspends your Digimon, this Digimon isn't affected by your opponent's Digimon's effects until the end of their turn.",
      inheritedEffectText:
        "[Your Turn] [Once Per Turn] When this Digimon attacks your opponent's Digimon, you may unsuspend this Digimon.",
    });
    expect(compiled).toEqual({
      effects: [
        { trigger: "Static", actions: [], keywords: [{ keyword: "Vortex", raw: "＜Vortex＞" }] },
        {
          trigger: "WhenDigivolving",
          actions: [
            {
              kind: "Suspend",
              target: { filter: { controllerDefault: "any", kind: ["Digimon"] }, count: 1 },
              optional: true,
            },
            {
              kind: "Restrict",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              restriction: "beAffected",
              fromSourceKind: ["Digimon"],
              byOpponentEffectsOnly: true,
              duration: "untilOpponentTurnEnd",
              condition: { kind: "lastSuspendedIsMine", raw: "if this effect suspends your Digimon" },
            },
          ],
        },
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "Unsuspend",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              condition: {
                kind: "attackTargetMatchesFilter",
                filter: { controller: "opponent", kind: ["Digimon"] },
                raw: "when this Digimon attacks your opponent's Digimon",
              },
              optional: true,
            },
          ],
          isInherited: true,
          frequency: "OncePerTurn",
        },
      ],
      coverage: "full",
      residual: [],
    });
    expect(hasRegisteredCompiledCard("EX7-034")).toBe(true);
  });

  it("publicly evolves, pays 3, draws exactly, suspends its ally, and blocks an opposing Digimon effect", async () => {
    let protectedAtResolve: boolean | undefined;
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX7-033", as: "base" },
            { card: "EX7-031", as: "ally" },
          ],
          hand: [{ card: "EX7-034", as: "grand" }],
          deck: [{ card: "BT1-009", as: "drawn" }, "BT1-011"],
          security: ["BT1-009"],
        },
        1: {
          hand: [{ card: "BT1-070", as: "kuwagamon" }],
          deck: ["BT1-011", "BT1-012"],
          security: ["BT1-013"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
        onEvent: (event) => {
          if (event.kind === "effectResolved" && event.sourceCardId === "BT1-070") {
            protectedAtResolve = observe(s.engine).isRestrictedByEffect(s.perm("base"), "beAffected", "Digimon");
          }
        },
      },
    );
    preferred.push(s.perm("ally").permanentId);
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;
    const baseId = s.inst("base").instanceId;
    const grandId = s.inst("grand").instanceId;
    const drawnId = s.inst("drawn").instanceId;
    expect(
      s.engine.applyIntent(0, { type: "digivolve", permanentId: s.perm("base").permanentId, instanceId: grandId }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === grandId && s.perm("ally").isSuspended);
    expect(s.state.memory).toBe(2);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(drawnId);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("base"), "beAffected", "Digimon")).toBe(true);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("kuwagamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-070"));
    expect(protectedAtResolve).toBe(true);
    expect(s.perm("base").isSuspended).toBe(false);
    await stopLoop(s, loop, 1);
  });

  it("suspends an opposing Digimon without granting itself protection", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX7-033", as: "base" }],
          hand: [{ card: "EX7-034", as: "grand" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "opponent" }] },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("opponent").permanentId);
    s.state.memory = 4;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("grand").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("opponent").isSuspended);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("base"), "beAffected", "Digimon")).toBe(false);
  });

  it("suspends nothing and grants no protection when the player declines the optional suspend", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX7-033", as: "base" }],
          hand: [{ card: "EX7-034", as: "grand" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "opponent" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    const grandId = s.inst("grand").instanceId;
    expect(
      s.engine.applyIntent(0, { type: "digivolve", permanentId: s.perm("base").permanentId, instanceId: grandId }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === grandId && s.state.pendingDecision === undefined);
    expect(s.perm("opponent").isSuspended).toBe(false);
    expect(s.perm("base").isSuspended).toBe(false);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("base"), "beAffected", "Digimon")).toBe(false);
    expect(s.state.memory).toBe(1);
  });

  it("stays suspended when the player declines the inherited unsuspend", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-080", as: "host", dp: 9000, under: ["EX7-034"] }], security: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-010", as: "first", dp: 3000, suspended: true }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("first").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("uses Vortex at end of turn to attack a suspended opposing Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX7-034", as: "vortex", dp: 7000 }], deck: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 3000, suspended: true }], deck: ["BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(true);
  });

  it("inherits optional once-per-turn unsuspend only when attacking an opposing Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-080", as: "host", dp: 9000, under: ["EX7-034"] }], security: ["BT1-009"] },
        1: {
          battleArea: [
            { card: "BT1-010", as: "first", dp: 3000, suspended: true },
            { card: "BT1-011", as: "second", dp: 3000, suspended: true },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const firstId = s.perm("first").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: firstId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => !s.state.players[1]!.battleArea.some((p) => p.permanentId === firstId) && !s.perm("host").isSuspended,
    );
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("second").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("rejects evolution from a non-green level 4 without payment, draw, or stack mutation", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-035", as: "base" }],
        hand: [{ card: "EX7-034", as: "grand" }],
        deck: [{ card: "BT1-009", as: "drawn" }],
      },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("grand").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").topCard.cardId).toBe("BT1-035");
    expect(s.perm("base").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("drawn").instanceId);
  });
});
