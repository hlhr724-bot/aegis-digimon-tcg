import { EffectDuration, getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../ST1/ST1-13.js";
import "../ST3/ST3-11.js";
import { compiled } from "./BT1-105.js";

describe("BT1-105 Blast Fire", () => {
  it("matches the catalog and compiles the original-DP override", () => {
    expect(getCardDefinition("BT1-105")).toMatchObject({
      cardId: "BT1-105",
      set: "BT1",
      nameEn: "Blast Fire",
      colors: ["Yellow"],
      kinds: ["Option"],
      playCost: 4,
      dp: 0,
      evoCosts: [],
      effectText:
        "[Main] Change the original DP of 1 of your opponent's Digimon to 3000 until the end of your opponent's next turn.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-105",
    });
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              effectTextPart:
                "[Main] Change the original DP of 1 of your opponent's Digimon to 3000 until the end of your opponent's next turn.",
              kind: "SetBaseDP",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              value: 3000,
              duration: "untilOpponentTurnEnd",
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("sets an opposing Digimon's original DP to 3000", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT1-047"],
          hand: [{ card: "BT1-105", as: "option" }],
        },
        1: { battleArea: [{ card: "BT2-047", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);

    expect(s.perm("target").currentDP).toBe(3000);
    // The client measures DP badges against this, so a DP-only change must publish it too.
    expect(s.perm("target").originalDPOverride).toBe(3000);
  });

  it("Q974/Q975 adds later DP modifiers, survives digivolution, then expires after the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT1-047"],
          hand: [{ card: "BT1-105", as: "blastFire" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
        },
        1: {
          battleArea: [{ card: "ST1-09", as: "target" }],
          hand: [
            { card: "ST1-13", as: "shadowWing" },
            { card: "ST1-11", as: "warGreymon" },
          ],
          deck: ["BT1-010"],
        },
      },
      { autoSelectCards: true },
    );
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const controllerTurn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen && s.state.phase === Phase.Main);
    s.state.memory = 20;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("blastFire").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await controllerTurn;

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    const opponentTurn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen && s.state.turnSeat === 1 && s.state.phase === Phase.Main);
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(1, {
        type: "playCard",
        instanceId: s.inst("shadowWing").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 6000);

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("target").permanentId,
        instanceId: s.inst("warGreymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard.cardId === "ST1-11");

    expect(s.perm("target").currentDP).toBe(6000);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await opponentTurn;

    expect(s.perm("target").currentDP).toBe(12_000);
  });

  it("Q973 lets a later -4000 DP effect delete the 3000-DP target", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST3-11", as: "seraphimon" }],
          hand: [{ card: "BT1-105", as: "blastFire" }],
        },
        1: {
          battleArea: [{ card: "ST3-07", as: "target" }],
          security: ["BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    const targetId = s.perm("target").permanentId;
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("blastFire").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 3000);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("seraphimon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetId));

    expect(s.state.players[1]!.trash.some((card) => card.cardId === "ST3-07")).toBe(true);
  });

  it("Q975 preserves an existing +1000 DP modifier on top of the changed 3000 original DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT1-047"],
          hand: [{ card: "BT1-105", as: "blastFire" }],
        },
        1: {
          battleArea: [{ card: "ST3-07", as: "target" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;
    await advance(s.engine).verb.modifyDP(s.perm("target").permanentId, 1000, EffectDuration.UntilOwnerTurnEnd);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blastFire").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 4000);

    expect(s.perm("target").baseDP).toBe(6000);
    expect(s.perm("target").currentDP).toBe(4000);
  });

  it("targets a moved, legally evolved stack after public hatch and preserves the override on its top card", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT1-047"],
          hand: [{ card: "BT1-105", as: "option" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
        },
        1: {
          eggDeck: [{ card: "BT1-003", as: "egg" }],
          hand: [
            { card: "BT1-028", as: "level3" },
            { card: "BT1-032", as: "level4" },
            { card: "BT1-042", as: "target" },
            { card: "BT1-009", as: "hold" },
          ],
          battleArea: [{ card: "BT10-028", as: "other" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
          security: ["BT1-009"],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;

    const secondTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);

    expect(s.engine.applyIntent(1, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-003");
    const permanentId = s.state.players[1]!.breeding!.permanentId;
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, { type: "digivolve", permanentId, instanceId: s.inst("level3").instanceId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-028");
    expect(
      s.engine.applyIntent(1, { type: "digivolve", permanentId, instanceId: s.inst("level4").instanceId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-032");
    expect(
      s.engine.applyIntent(1, { type: "digivolve", permanentId, instanceId: s.inst("target").instanceId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-042");
    advance(s.engine).endMainPhaseIfOpen(1);
    await secondTurn;
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;

    const thirdTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await thirdTurn;
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;

    const fourthTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
    expect(s.engine.applyIntent(1, { type: "moveFromBreeding", permanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some((p) => p.permanentId === permanentId));
    const target = s.state.players[1]!.battleArea.find((p) => p.permanentId === permanentId)!;
    expect(target.stack.map((card) => card.cardId)).toEqual(["BT1-003", "BT1-028", "BT1-032"]);
    preferred.push(target.topCard!.instanceId);

    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await fourthTurn;
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;

    const fifthTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => target.currentDP === 3000);
    expect(target.currentDP).toBe(3000);
    expect(s.perm("other").currentDP).toBe(12000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await fifthTurn;
  });

  it("has no Security effect and is simply trashed after the check", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 5000 }] },
      1: { security: [{ card: "BT1-105", as: "securityOption" }] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityOption").instanceId);
  });
});

describe("BT1-105 Blast Fire — KB Q&A rulings", () => {
  it("treats the target's printed DP as 3000 while other Digimon keep their printed DP (Q972)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: ["BT1-047"], hand: [{ card: "BT1-105", as: "blastFire" }] },
        1: {
          battleArea: [
            { card: "ST1-09", as: "target" },
            { card: "BT1-016", as: "untouched" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("target").topCard.instanceId);
    s.state.memory = 4;
    await s.ready();
    expect(getCardDefinition("ST1-09")?.dp).toBe(7000);
    expect(s.perm("target").currentDP).toBe(7000);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blastFire").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 3000);

    expect(s.perm("target").currentDP).toBe(3000);
    expect(s.perm("untouched").currentDP).toBe(getCardDefinition("BT1-016")?.dp);
  });

  it("keeps the digivolved Digimon at 3000 DP instead of its new printed DP (Q976)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT1-047"],
          hand: [{ card: "BT1-105", as: "blastFire" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
        },
        1: {
          battleArea: [{ card: "ST1-09", as: "target" }],
          hand: [{ card: "ST1-11", as: "warGreymon" }],
          deck: ["BT1-010", "BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const controllerTurn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen && s.state.phase === Phase.Main);
    s.state.memory = 4;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blastFire").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 3000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await controllerTurn;

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    const opponentTurn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen && s.state.turnSeat === 1 && s.state.phase === Phase.Main);
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("target").permanentId,
        instanceId: s.inst("warGreymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard.cardId === "ST1-11");
    await s.engine.recomputeContinuousEffects();

    expect(getCardDefinition("ST1-11")?.dp).toBe(12_000);
    expect(s.perm("target").currentDP).toBe(3000);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await opponentTurn;

    expect(s.perm("target").currentDP).toBe(12_000);
  });
});
