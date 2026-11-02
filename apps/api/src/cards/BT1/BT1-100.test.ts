import { Phase, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-100.js";

async function setupPublicRedStack() {
  const s = setupEngine(
    {
      0: {
        battleArea: ["BT1-028"],
        hand: [{ card: "BT1-100", as: "mainOption" }],
        security: [{ card: "BT1-100", as: "securityOption" }],
        deck: ["BT1-029", "BT1-030", "BT1-031", "BT1-032", "BT1-033", "BT1-034", "BT1-035"],
      },
      1: {
        battleArea: [{ card: "BT1-010", as: "noSources" }],
        eggDeck: [{ card: "BT1-001", as: "egg" }],
        hand: [
          { card: "BT1-010", as: "lv3" },
          { card: "BT1-014", as: "lv4" },
        ],
        deck: ["BT1-029", "BT1-030", "BT1-031", "BT1-032", "BT1-033", "BT1-034", "BT1-035"],
      },
    },
    { autoSelectCards: true },
  );
  const loop = s.engine.startTurnLoop();

  await advance(s.engine).waitForMainPhase(0);
  advance(s.engine).endMainPhaseIfOpen(0);
  await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
  expect(s.engine.applyIntent(1, { type: "hatchEgg" })).toEqual({ ok: true });
  const breedingPermanentId = s.state.players[1]!.breeding!.permanentId;
  await advance(s.engine).waitForMainPhase(1);
  s.state.memory = 2;
  for (const alias of ["lv3", "lv4"] as const) {
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: breedingPermanentId,
        instanceId: s.inst(alias).instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.instanceId === s.inst(alias).instanceId);
  }
  expect(s.state.players[1]!.breeding!.stack.map(({ cardId }) => cardId)).toEqual(["BT1-001", "BT1-010"]);

  advance(s.engine).endMainPhaseIfOpen(1);
  await advance(s.engine).waitForMainPhase(0);
  advance(s.engine).endMainPhaseIfOpen(0);
  await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
  expect(s.engine.applyIntent(1, { type: "moveFromBreeding", permanentId: breedingPermanentId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === breedingPermanentId));
  const withSource = s.state.players[1]!.battleArea.find(({ permanentId }) => permanentId === breedingPermanentId)!;

  advance(s.engine).endMainPhaseIfOpen(1);
  await advance(s.engine).waitForMainPhase(0);
  return { s, loop, withSource };
}

describe("BT1-100 Grace Cross Freezer", () => {
  it("matches the catalog and compiles dynamic source-less attack restrictions", () => {
    expect(getCardDefinition("BT1-100")).toMatchObject({
      cardId: "BT1-100",
      set: "BT1",
      nameEn: "Grace Cross Freezer",
      colors: ["Blue"],
      kinds: ["Option"],
      playCost: 4,
      dp: 0,
      evoCosts: [],
      effectText:
        "[Main] Until the end of your opponent's next turn, their Digimon with no digivolution cards can't attack.",
      securityEffectText: "[Security] Your opponent's Digimon with no digivolution cards can't attack for the turn.",
      rarity: "R",
      maxCountInDeck: 4,
      imageId: "BT1-100",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Until the end of your opponent's next turn, their Digimon with no digivolution cards can't attack.",
            kind: "Restrict",
            target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "none" }, count: "all" },
            whileMatchesTargetFilter: true,
            restriction: "attack",
            duration: "untilOpponentTurnEnd",
          },
        ],
      },
      {
        trigger: "Security",
        actions: [
          {
            kind: "Restrict",
            target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "none" }, count: "all" },
            whileMatchesTargetFilter: true,
            restriction: "attack",
            duration: "forTheTurn",
          },
        ],
        isSecurity: true,
      },
    ]);
  });

  it("prevents all opposing Digimon without sources from attacking", async () => {
    const { s, loop, withSource } = await setupPublicRedStack();
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mainOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("noSources"), "attack"));
    expect(observe(s.engine).isRestricted(withSource.permanentId, "attack")).toBe(false);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("keeps the restriction through the opponent turn and expires at that turn end", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT1-028"],
        hand: [{ card: "BT1-100", as: "option" }],
        deck: ["BT1-029"],
      },
      1: {
        battleArea: [{ card: "BT1-010", as: "target" }],
        deck: ["BT1-029"],
      },
    });
    const controllerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 4;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "attack"));

    advance(s.engine).endMainPhaseIfOpen(0);
    await controllerTurn;
    s.state.turnSeat = 1;
    s.state.memory = 0;

    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);
  });

  it("allows a restricted Digimon to attack after it gains a digivolution card (Q965)", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT1-028"],
        hand: [{ card: "BT1-100", as: "option" }],
      },
      1: {
        battleArea: [{ card: "BT1-014", as: "target" }],
        hand: [{ card: "BT1-021", as: "evolving" }],
        deck: ["BT1-029"],
      },
    });
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "attack"));

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("target").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard.cardId === "BT1-021");
    expect(s.perm("target").stack.map(({ cardId }) => cardId)).toEqual(["BT1-014"]);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("also restricts a source-less opposing Digimon that enters after the Option resolves", async () => {
    const s = setupEngine({
      0: { battleArea: ["BT1-028"], hand: [{ card: "BT1-100", as: "option" }] },
    });
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT1-100"));

    const lateArrival = s.putOnBoard(1, { card: "BT1-010" });

    expect(observe(s.engine).isRestricted(lateArrival, "attack")).toBe(true);
  });

  it("prevents opposing source-less Digimon from attacking from security", async () => {
    const { s, loop, withSource } = await setupPublicRedStack();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("noSources").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0 && !observe(s.engine).isAttacking());
    expect(observe(s.engine).isRestricted(s.perm("noSources"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(withSource.permanentId, "attack")).toBe(false);
    s.state.turnSeat = 0;
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
