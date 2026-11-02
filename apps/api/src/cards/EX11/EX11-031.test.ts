import { digivolutionRequirementsFor, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { chooseTargetsInOrder } from "./qaRulings.testSupport.js";

const cardId = "EX11-031";

describe("EX11-031 Vespamon", () => {
  it("preserves printed stats, Royal Base evolution, face-up security scaling, and replacement effect", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Vespamon",
      colors: ["Green", "Black"],
      level: 5,
      playCost: 8,
      dp: 8000,
      evoCosts: [
        { color: "Green", level: 4, memoryCost: 4 },
        { color: "Black", level: 4, memoryCost: 4 },
      ],
      types: ["Cyborg", "X Antibody", "Royal Base", "LIBERATOR", "Insectoid"],
    });
    const compiled = runtimeCompiledCard(cardId)!;
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 4, traits: ["Royal Base"], cost: 3, isAlternate: true },
    ]);
    expect(digivolutionRequirementsFor(cardId)).toEqual(compiled.digivolutionRequirement);
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      const effect = compiled.effects.find((candidate) => candidate.trigger === trigger)!;
      expect(effect.actions[0]).toMatchObject({
        kind: "Suspend",
        scaling: { per: 1, unit: "security", filter: { controller: "mine", faceUp: true } },
      });
      expect(effect.actions[1]).toMatchObject({
        kind: "Restrict",
        restriction: "unsuspend",
        duration: "untilOpponentTurnEnd",
      });
    }
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "AllTurns",
        isInherited: true,
        frequency: "OncePerTurn",
        actions: [
          expect.objectContaining({
            kind: "Replacement",
            event: "wouldLeavePlay",
            leaveCause: "otherThanYourEffect",
            cost: expect.objectContaining({ kind: "flipSecurity" }),
          }),
        ],
      }),
    );
  });

  it("grants Blocker only to own Royal Base Digimon from face-up security on the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: cardId, faceUp: true }],
        battleArea: [
          { card: "EX11-030", as: "royalBase" },
          { card: "BT1-009", as: "plain" },
        ],
      },
      1: { battleArea: [{ card: "EX11-030", as: "opposingRoyalBase" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("royalBase"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("plain"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("opposingRoyalBase"), "Blocker")).toBe(false);
    assertNoLoudGap(s);
  });

  it("suspends once per face-up security card and restricts an independently selected card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "source" }],
          security: [
            { card: "BT1-009", faceUp: true },
            { card: "BT1-010", faceUp: true },
            { card: "BT1-012", faceUp: false },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
            { card: "BT1-011", as: "third", suspended: true },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(true);
    await advance(s.engine).verb.unsuspend([s.perm("first").permanentId]);
    expect(s.perm("first").isSuspended).toBe(true);
    assertNoLoudGap(s);
  });

  it("suspends nothing without a face-up security card but still restricts unsuspending", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "source" }],
          security: [{ card: "BT1-009", faceUp: false }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "victim", suspended: true },
            { card: "BT1-010", as: "bystander" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("victim").topCard.instanceId);
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    expect(s.perm("bystander").isSuspended).toBe(false);
    await advance(s.engine).verb.unsuspend([s.perm("victim").permanentId]);
    expect(s.perm("victim").isSuspended).toBe(true);
    assertNoLoudGap(s);
  });

  it("does not protect a Digimon without the Royal Base trait", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-032", as: "carrier", under: [cardId] },
            { card: "BT1-009", as: "plain" },
          ],
          security: [{ card: "BT1-009", faceUp: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(await advance(s.engine).verb.deletePermanent([s.perm("plain").permanentId], "byEffect")).toBe(1);
    expect(s.state.players[0]!.security[0]).toMatchObject({ faceUp: true });
    assertNoLoudGap(s);
  });

  it("inherits once-per-turn protection from non-owner effects and pays with the top face-up security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-032", as: "carrier", under: [cardId] },
            { card: "EX11-030", as: "protected" },
          ],
          security: [{ card: "BT1-009", faceUp: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(await advance(s.engine).verb.deletePermanent([s.perm("protected").permanentId], "byEffect")).toBe(0);
    expect(
      s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === s.perm("protected").permanentId),
    ).toBe(true);
    expect(s.state.players[0]!.security[0]).toMatchObject({ faceUp: false });
    assertNoLoudGap(s);
  });

  it("protects a separate Royal Base Digimon from public opponent Gaia Force", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-032", as: "host", under: [cardId] },
            { card: "EX11-030", as: "protected" },
          ],
          security: [{ card: "BT1-013", as: "payment", faceUp: true }],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "redSource" }],
          hand: [{ card: "ST1-16", as: "gaiaForce" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    preferred.push(s.perm("protected").permanentId);
    await s.ready();

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security[0]?.faceUp === false);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("protected").permanentId,
    );
    expect(s.state.players[0]!.security[0]).toMatchObject({ instanceId: s.inst("payment").instanceId, faceUp: false });
    assertNoLoudGap(s);
  });

  it("reuses the inherited replacement after the next own turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-032", as: "carrier", under: [cardId] },
            { card: "EX11-030", as: "firstProtected" },
            { card: "EX11-030", as: "secondProtected" },
          ],
          security: [
            { card: "BT1-013", as: "firstPayment", faceUp: true },
            { card: "BT1-014", as: "secondPayment", faceUp: true },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { deck: ["BT1-011", "BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(1);
    expect(await advance(s.engine).verb.deletePermanent([s.perm("firstProtected").permanentId], "byBattle")).toBe(0);
    expect(s.state.players[0]!.security[0]).toMatchObject({
      instanceId: s.inst("firstPayment").instanceId,
      faceUp: false,
    });
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("carrier").topCard.cardId).toBe("EX11-032");
    expect(await advance(s.engine).verb.deletePermanent([s.perm("secondProtected").permanentId], "byBattle")).toBe(0);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual(
      expect.arrayContaining([s.perm("secondProtected").permanentId]),
    );
    expect(s.state.players[0]!.security[1]).toMatchObject({
      instanceId: s.inst("secondPayment").instanceId,
      faceUp: false,
    });
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
    assertNoLoudGap(s);
  });

  it("plays through the public intent, scales from face-up security, and restricts a legal opponent target", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "vespamon" }],
          security: [
            { card: "BT1-009", faceUp: true },
            { card: "BT1-010", faceUp: true },
            { card: "BT1-012", faceUp: false },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
            { card: "BT1-011", as: "third" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 8;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("vespamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("first").isSuspended && s.perm("second").isSuspended);

    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(true);
    expect(s.perm("third").isSuspended).toBe(false);
    await advance(s.engine).verb.unsuspend([s.perm("first").permanentId]);
    expect(s.perm("first").isSuspended).toBe(true);
    assertNoLoudGap(s);
  });

  it("digivolves through the public alternate Royal Base route for cost 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX11-030", as: "royalBase" }],
          hand: [{ card: cardId, as: "vespamon" }],
          security: [
            { card: "BT1-009", faceUp: true },
            { card: "BT1-010", faceUp: true },
            { card: "BT1-012", faceUp: false },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
            { card: "BT1-011", as: "third" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("royalBase").permanentId,
        instanceId: s.inst("vespamon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("royalBase").topCard.instanceId === s.inst("vespamon").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.perm("royalBase").topCard.cardId).toBe(cardId);
    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(true);
    expect(s.perm("third").isSuspended).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("first"), "unsuspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("second"), "unsuspend")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("third"), "unsuspend")).toBe(false);
    assertNoLoudGap(s);
  });
});

describe("EX11-031 Vespamon — KB Q&A rulings", () => {
  it("may give 'can't unsuspend' to a different card from the one it suspended (Q5837)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "source" }], security: [{ card: "BT1-012", faceUp: true }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
            { card: "BT1-011", as: "third" },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    await s.ready();

    const resolution = advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    await chooseTargetsInOrder(s, 0, [["first"], ["third"]]);
    await resolution;

    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("third").isSuspended).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("third"), "unsuspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("first"), "unsuspend")).toBe(false);
  });
});
