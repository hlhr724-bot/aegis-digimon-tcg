import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition, Phase } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type SeatSpec } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-003.js";
import "./BT1-028.js";

describe("BT1-003 Upamon", () => {
  it("matches the catalog and preserves the inherited once-per-turn draw in IR", async () => {
    expect(getCardDefinition("BT1-003")).toMatchObject({
      cardId: "BT1-003",
      nameEn: "Upamon",
      colors: ["Blue"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      dp: 0,
      evoCosts: [],
      forms: ["In-Training"],
      types: ["Amphibian"],
      inheritedEffectText:
        "[When Attacking][Once Per Turn] If your opponent has a Digimon with no digivolution cards in play, trigger ＜Draw 1＞ (Draw 1 card from your deck).",
    });
    expect(getCardDefinition("BT1-003")?.effectText).toBeUndefined();
    expect(compiled.effects).toEqual([
      {
        trigger: "WhenAttacking",
        isInherited: true,
        frequency: "OncePerTurn",
        actions: [
          {
            kind: "Draw",
            controller: "mine",
            amount: 1,
            condition: {
              kind: "opponentHas",
              countMin: 1,
              filter: { kind: ["Digimon"], zone: "battleArea", digivolutionCards: "none" },
            },
          },
        ],
      },
    ]);
  });

  it("draws once per turn when attacking while the opponent has a source-less Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-032", as: "attacker", under: ["BT1-003"] }],
        deck: [
          { card: "BT1-010", as: "drawn" },
          { card: "BT1-012", as: "notDrawn" },
        ],
      },
      1: { battleArea: ["BT1-016"] },
    });
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("attacker"));
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("attacker"));

    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.hand[0]!.instanceId).toBe(s.inst("drawn").instanceId);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("notDrawn").instanceId);
  });

  it("does not count a source-less Digimon in the opponent's breeding area", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-032", as: "attacker", under: ["BT1-003"] }],
        deck: [{ card: "BT1-010", as: "top" }],
      },
      1: { breeding: "BT1-016", security: ["BT1-011"] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });

  it("does not count a sourced battle-area Digimon as the required source-less peer", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-032", as: "attacker", under: ["BT1-003"] }],
        deck: [{ card: "BT1-010", as: "top" }],
      },
      1: { battleArea: [{ card: "BT1-016", as: "sourced", under: ["BT1-009"] }] },
    });
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("attacker"));

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });

  it("carries Draw through hatch, legal breeding digivolution, exact cost/draw/stack, and move", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-003", as: "egg" }],
          hand: [
            { card: "BT1-028", as: "elecmon" },
            { card: "BT1-032", as: "frigimon" },
          ],
          deck: [
            { card: "BT1-010", as: "breedingDraw" },
            { card: "BT1-011", as: "evolutionDraw" },
            { card: "BT1-012", as: "turnDraw1" },
            { card: "BT1-013", as: "firstAttackDraw" },
            { card: "BT1-014", as: "turnDraw2" },
            { card: "BT1-015", as: "secondAttackDraw" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-016", as: "sourceLess" },
            { card: "BT1-017", as: "sourced", under: ["BT1-009"] },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-003");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const permanentId = s.state.players[0]!.breeding!.permanentId;
    expect(s.state.players[0]!.eggDeck).toHaveLength(0);

    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 1;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId,
        instanceId: s.inst("elecmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-028");
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("breedingDraw").instanceId);
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1);

    const carrier = s.state.players[0]!.battleArea[0]!;
    expect(carrier.topCard?.cardId).toBe("BT1-028");
    expect(carrier.stack.map(({ cardId }) => cardId)).toEqual(["BT1-003"]);

    s.state.memory = 2;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: carrier.permanentId,
        instanceId: s.inst("frigimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT1-032"));
    const evolvedCarrier = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT1-032")!;
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("evolutionDraw").instanceId);
    expect(evolvedCarrier.stack.map(({ cardId }) => cardId)).toEqual(["BT1-003", "BT1-028"]);

    const attack = () =>
      s.engine.applyIntent(0, {
        type: "attack" as const,
        attackerPermanentId: evolvedCarrier.permanentId,
        target: { kind: "player" as const },
      });
    const firstAttackDrawId = s.state.players[0]!.deck[0]!.instanceId;
    expect(attack()).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 3);
    expect(s.state.players[0]!.hand).toHaveLength(4);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(firstAttackDrawId);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    await advance(s.engine).waitForMainPhase(0);
    expect(evolvedCarrier.isSuspended).toBe(false);
    const secondAttackDrawId = s.state.players[0]!.deck[0]!.instanceId;
    expect(attack()).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2);
    expect(s.state.players[0]!.hand).toHaveLength(6);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(secondAttackDrawId);

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("BT1-003 Upamon — KB Q&A rulings", () => {
  const attackPlayerWithOpponent = async (opponent: SeatSpec) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-032", as: "attacker", under: ["BT1-003"] }],
        deck: [{ card: "BT1-010", as: "top" }],
      },
      1: { ...opponent, security: ["BT1-011"] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    return s;
  };

  it("does not draw when the opponent's only source-less Digimon is in the breeding area (Q868)", async () => {
    const breeding = await attackPlayerWithOpponent({ breeding: "BT1-016" });
    expect(breeding.state.players[0]!.hand).toHaveLength(0);
    expect(breeding.state.players[0]!.deck).toHaveLength(1);

    const battleArea = await attackPlayerWithOpponent({ battleArea: ["BT1-016"] });
    expect(battleArea.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      battleArea.inst("top").instanceId,
    ]);
  });
});
