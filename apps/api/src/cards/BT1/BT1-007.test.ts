import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type CardSpec } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-007.js";
import "./BT1-078.js";

describe("BT1-007 Tanemon", () => {
  it("matches the catalog and exports its inherited battle-area evolution boost", () => {
    expect(getCardDefinition("BT1-007")).toMatchObject({
      cardId: "BT1-007",
      nameEn: "Tanemon",
      colors: ["Green"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      dp: 0,
      evoCosts: [],
      forms: ["In-Training"],
      types: ["Bulb"],
      inheritedEffectText: "[When Attacking] If you've digivolved this turn, this Digimon gets +1000 DP for the turn.",
    });
    expect(getCardDefinition("BT1-007")?.effectText).toBeUndefined();
    expect(compiled.effects).toEqual([
      {
        trigger: "WhenAttacking",
        isInherited: true,
        actions: [
          {
            kind: "ModifyDP",
            amount: 1000,
            duration: "forTheTurn",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            condition: { kind: "youDigivolvedThisTurn" },
          },
        ],
      },
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("gives +1000 DP when attacking after its Digimon digivolved that turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-068", as: "base", dp: 3000, under: ["BT1-007"] }],
        hand: [{ card: "BT1-074", as: "evolving" }],
      },
      1: { security: ["BT1-010"] },
    });
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("evolving").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-007"));
    expect(s.perm("base").currentDP).toBe(s.perm("base").baseDP + 1000);
  });

  it("Q870: does not count a digivolution performed in the breeding area", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-068", as: "host", dp: 3000, under: ["BT1-007"] }],
        eggDeck: [{ card: "BT1-007", as: "breedingBase" }],
        hand: [{ card: "BT1-068", as: "breedingEvolution" }],
        deck: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
      },
      1: { deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"], security: ["BT1-012"] },
    });
    s.state.memory = 3;
    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-007");
    const breedingPermanentId = s.state.players[0]!.breeding!.permanentId;
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: breedingPermanentId,
        instanceId: s.inst("breedingEvolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.instanceId === s.inst("breedingEvolution").instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.perm("host").currentDP).toBe(s.perm("host").baseDP);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("counts a battle-area digivolution performed by Jagamon's effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-078", as: "host", under: ["BT1-007"] }],
          deck: [{ card: "BT1-081", as: "evolution" }, "BT1-010", "BT1-011"],
        },
        1: { security: ["BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("host").topCard.instanceId === s.inst("evolution").instanceId &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-007"),
    );

    expect(s.perm("host").currentDP).toBe(s.perm("host").baseDP + 1000);
  });

  it("carries the inherited boost through hatch -> breeding digivolve -> move, with a peer stack", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-007", as: "egg" }],
          battleArea: [{ card: "BT1-068", as: "peer", dp: 4000 }],
          hand: [
            { card: "BT1-068", as: "kokuwamon" },
            { card: "BT1-074", as: "togemon" },
            { card: "BT1-078", as: "jagamon" },
          ],
          deck: [
            "BT1-010",
            "BT1-011",
            "BT1-012",
            "BT1-013",
            "BT1-014",
            "BT1-016",
            "BT1-010",
            "BT1-011",
            "BT1-012",
            "BT1-013",
          ],
          security: ["BT1-010", "BT1-011"],
        },
        1: {
          deck: ["BT1-012", "BT1-013", "BT1-014", "BT1-016", "BT1-012", "BT1-013", "BT1-014", "BT1-016"],
          security: ["BT1-012", "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-007");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const eggPermanentId = s.state.players[0]!.breeding!.permanentId;

    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eggPermanentId,
        instanceId: s.inst("kokuwamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-068");
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: eggPermanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    const carrier = s.state.players[0]!.battleArea.find(({ stack }) =>
      stack.some(({ instanceId }) => instanceId === eggInstanceId),
    )!;
    expect(carrier.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: carrier.permanentId,
        instanceId: s.inst("togemon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => carrier.topCard?.cardId === "BT1-074");
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: carrier.permanentId,
        instanceId: s.inst("jagamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => carrier.topCard?.cardId === "BT1-078");
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: carrier.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-007"));
    expect(carrier.currentDP).toBe(carrier.baseDP + 1000);
    expect(s.perm("peer").currentDP).toBe(s.perm("peer").baseDP);
    expect(s.state.pendingDecision).toBeUndefined();

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("BT1-007 Tanemon — KB Q&A rulings", () => {
  const attackWithJagamon = async (deck: CardSpec[]) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-078", as: "host", under: ["BT1-007"] }], deck },
        1: { security: ["BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    return s;
  };

  it("counts a digivolution performed by Jagamon's effect as having digivolved this turn (Q871)", async () => {
    const digivolved = await attackWithJagamon([{ card: "BT1-081", as: "evolution" }, "BT1-010", "BT1-011"]);
    expect(digivolved.perm("host").topCard.instanceId).toBe(digivolved.inst("evolution").instanceId);
    expect(digivolved.perm("host").currentDP).toBe(11000);

    const notDigivolved = await attackWithJagamon(["BT1-010", "BT1-011", "BT1-012"]);
    expect(notDigivolved.perm("host").topCard.cardId).toBe("BT1-078");
    expect(notDigivolved.perm("host").currentDP).toBe(7000);
  });
});
