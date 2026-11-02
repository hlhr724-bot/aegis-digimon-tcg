import { EffectTiming, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./BT4-016.js";
import "./BT4-098.js";

describe("BT4-098 Atomic Inferno", () => {
  it("boosts a Hybrid and grants Security Attack +1", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT4-016", as: "target" }], hand: [{ card: "BT4-098", as: "option" }] } },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.perm("target").currentDP === s.perm("target").baseDP + 3000 &&
        observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack") === 2,
    );
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(2);
  });

  it("applies the DP clause to one selected Hybrid", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT4-011", as: "first" },
            { card: "BT4-015", as: "second" },
          ],
          hand: [{ card: "BT4-098", as: "option" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("first").currentDP !== s.perm("first").baseDP);
    expect(s.perm("first").currentDP).toBe(s.perm("first").baseDP + 3000);
    expect(s.perm("second").currentDP).toBe(s.perm("second").baseDP);
  });

  it("grants all own Digimon Security Attack +1 from security", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT4-016", as: "first" },
          { card: "BT4-018", as: "second" },
        ],
        security: [{ card: "BT4-098", as: "securityOption", faceUp: true }],
      },
    });
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    expect(observe(s.engine).keywordAmount(s.perm("first"), "SecurityAttack")).toBe(2);
    expect(observe(s.engine).keywordAmount(s.perm("second"), "SecurityAttack")).toBe(1);
  });

  it("grants the security aura to an own Digimon played afterward", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT4-098", as: "securityOption", faceUp: true }],
        deck: ["BT1-001", "BT1-002"],
      },
      1: { deck: ["BT1-001", "BT1-002"] },
    });
    s.state.turnSeat = 1;
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));

    s.putOnBoard(0, { card: "BT4-018", as: "entrant" });
    await settle(() => observe(s.engine).keywordAmount(s.perm("entrant"), "SecurityAttack") === 1);

    expect(observe(s.engine).keywordAmount(s.perm("entrant"), "SecurityAttack")).toBe(1);

    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(0);

    expect(observe(s.engine).keywordAmount(s.perm("entrant"), "SecurityAttack")).toBe(0);
  });
});

describe("BT4-098 Atomic Inferno — KB Q&A rulings", () => {
  async function attackSuspendedDigimonAfterAtomicInferno(response: "decline" | "block") {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT4-016", as: "hybrid" }], hand: [{ card: "BT4-098", as: "option" }] },
        1: {
          battleArea: [
            { card: "BT1-010", as: "attackTarget", suspended: true },
            { card: "BT5-062", as: "blocker" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("hybrid").currentDP === s.perm("hybrid").baseDP + 3000);
    expect(s.state.memory).toBe(2);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("hybrid").permanentId,
        target: { kind: "permanent", permanentId: s.perm("attackTarget").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    const blockIntent =
      response === "block"
        ? ({ type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId } as const)
        : ({ type: "declineBlock" } as const);
    expect(s.engine.applyIntent(1, blockIntent)).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
    return s;
  }

  it("gains no memory when its Digimon attacks an opponent's Digimon without being blocked (Q1254)", async () => {
    const attackedDigimon = await attackSuspendedDigimonAfterAtomicInferno("decline");
    expect(attackedDigimon.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual([
      "BT5-062",
    ]);
    expect(attackedDigimon.state.memory).toBe(2);

    const blocked = await attackSuspendedDigimonAfterAtomicInferno("block");
    expect(blocked.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT1-010"]);
    expect(blocked.state.memory).toBe(5);
  });

  it("grants Security Attack +1 to Digimon that enter the battle area after the effect, from breeding or from hand (Q1255)", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT1-009", as: "raised" },
          hand: [{ card: "BT1-014", as: "played" }],
          security: [{ card: "BT4-098", as: "securityOption" }],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "attacker" }],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const loop = s.engine.startTurnLoop();

    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("securityOption").instanceId),
    );
    advance(s.engine).endMainPhaseIfOpen(1);

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("raised").permanentId })).toEqual({
      ok: true,
    });
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    const playedPermanent = () =>
      s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === s.inst("played").instanceId);
    await settle(() => playedPermanent() !== undefined && s.state.pendingDecision === undefined);

    expect(observe(s.engine).keywordAmount(s.perm("raised"), "SecurityAttack")).toBe(1);
    expect(observe(s.engine).keywordAmount(playedPermanent()!, "SecurityAttack")).toBe(1);
    expect(observe(s.engine).keywordAmount(s.perm("attacker"), "SecurityAttack")).toBe(0);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("BT4-098 Atomic Inferno — granted memory gain scope", () => {
  const filler = ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"];

  it("gains no memory when a different Digimon of yours is blocked", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT4-016", as: "hybrid" },
            { card: "BT1-010", as: "otherAttacker" },
          ],
          hand: [{ card: "BT4-098", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "attackTarget", suspended: true },
            { card: "BT5-062", as: "blocker" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("hybrid").currentDP === s.perm("hybrid").baseDP + 3000);
    expect(s.state.memory).toBe(2);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("otherAttacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("attackTarget").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(2);
  });

  it("ends the granted memory gain with the turn it was used", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT4-016", as: "hybrid" }],
          hand: [{ card: "BT4-098", as: "option" }],
          deck: [...filler],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT5-062", as: "blocker" }],
          deck: [...filler],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("hybrid").currentDP === s.perm("hybrid").baseDP + 3000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });

    await advance(s.engine).waitForMainPhase(1);
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });

    await advance(s.engine).waitForMainPhase(0);
    await s.ready();
    const memoryBeforeAttack = s.state.memory;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("hybrid").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(memoryBeforeAttack);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
