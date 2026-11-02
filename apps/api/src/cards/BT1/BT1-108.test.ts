import { EffectTiming, getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-108.js";

describe("BT1-108 Horn Buster", () => {
  it("matches the catalog and compiles both printed effects", () => {
    expect(getCardDefinition("BT1-108")).toMatchObject({
      cardId: "BT1-108",
      set: "BT1",
      nameEn: "Horn Buster",
      colors: ["Green"],
      kinds: ["Option"],
      playCost: 1,
      dp: 0,
      evoCosts: [],
      effectText: "[Main] 1 of your Digimon gets +3000 DP for the turn.",
      securityEffectText: "[Security] Suspend 1 of your opponent's Digimon. Then add this card its owner's hand.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-108",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] 1 of your Digimon gets +3000 DP for the turn.",
            kind: "ModifyDP",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            amount: 3000,
            duration: "forTheTurn",
          },
        ],
      },
      {
        trigger: "Security",
        actions: [
          { kind: "Suspend", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 } },
          { kind: "AddToHandSelf" },
        ],
        isSecurity: true,
      },
    ]);
  });

  it("gives exactly one of your Digimon +3000 DP for the turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-066", as: "chosen" },
            { card: "BT1-068", as: "other" },
          ],
          hand: [{ card: "BT1-108", as: "option" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
        },
      },
      { autoSelectCards: true },
    );
    const otherDP = s.perm("other").currentDP;
    s.state.memory = 1;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("chosen").currentDP === 5000);

    expect(s.perm("chosen").currentDP).toBe(5000);
    expect(s.perm("other").currentDP).toBe(otherDP);

    await advance(s.engine).runTurn(0);
    expect(s.perm("chosen").currentDP).toBe(2000);
  });

  it("buffs a moved, legally evolved stack after public hatch while leaving the opponent unchanged", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-003", as: "egg" }],
          battleArea: [{ card: "BT1-066", as: "colorSource" }],
          hand: [
            { card: "BT1-028", as: "level3" },
            { card: "BT1-032", as: "target" },
            { card: "BT1-108", as: "option" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT10-028", as: "opponent" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          security: ["BT1-009"],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    const firstTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-003");
    const permanentId = s.state.players[0]!.breeding!.permanentId;
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: s.inst("level3").instanceId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-028");
    expect(
      s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: s.inst("target").instanceId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-032");
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    const secondTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await secondTurn;
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;
    const thirdTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.permanentId === permanentId));
    const target = s.perm("target");
    expect(target.stack.map((card) => card.cardId)).toEqual(["BT1-003", "BT1-028"]);
    preferred.push(target.topCard!.instanceId);

    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 1;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => target.currentDP === 7000);
    expect(target.currentDP).toBe(7000);
    expect(s.perm("opponent").currentDP).toBe(12000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await thirdTurn;
  });

  it("suspends one opponent Digimon and returns itself to hand from security", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT1-108", as: "securityOption", faceUp: true }],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "chosen" },
            { card: "BT1-011", as: "other" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    const optionId = s.inst("securityOption").instanceId;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));

    expect(s.perm("chosen").isSuspended).toBe(true);
    expect(s.perm("other").isSuspended).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(optionId);
  });

  it("resolves its Security effect from a real attack, without relying on an injected timing", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { security: [{ card: "BT1-108", as: "securityOption" }] },
        1: {
          battleArea: [
            { card: "BT1-010", as: "attacker", dp: 5000 },
            { card: "BT1-011", as: "chosen" },
            { card: "BT1-012", as: "other" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    const optionId = s.inst("securityOption").instanceId;
    preferred.push(s.perm("chosen").topCard!.instanceId);
    await s.ready();
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === optionId));

    expect(s.perm("chosen").isSuspended).toBe(true);
    expect(s.perm("other").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(0);
    // Discord 1557410815466938429: the client holds this hand arrival by its security origin.
    expect(
      s.events.find(
        (event) => event.kind === "cardsMoved" && event.to === "hand" && event.instanceIds.includes(optionId),
      ),
    ).toMatchObject({ handAddition: "transfer", seat: 0, fromSecurityCheck: true });
  });
});
