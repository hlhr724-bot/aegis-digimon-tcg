import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT11-029.js";
import "./BT11-112.js";

describe("BT11-029 AeroVeedramon", () => {
  it("matches the catalog and carries both complete printed contracts", () => {
    expect(getCardDefinition("BT11-029")).toMatchObject({
      cardId: "BT11-029",
      nameEn: "AeroVeedramon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 8,
      dp: 8000,
      evoCosts: [{ color: "Blue", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Holy Dragon"],
    });
    expect(compiled).toMatchObject({
      effects: [
        {
          trigger: "Main",
          frequency: "OncePerTurn",
          actions: [{ kind: "RevealAdd", revealCount: 3, rest: "deckBottom", cost: { kind: "suspend" } }],
        },
        {
          trigger: "Static",
          isInherited: true,
          frequency: "OncePerTurn",
          actions: [{ kind: "SubTrigger", event: "whenAttacking", actions: [{ kind: "ActivateEffect" }] }],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("evolves from blue level 4 for 3", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT11-027", as: "base" }], hand: [{ card: "BT11-029", as: "aero" }] },
    });
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("aero").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT11-029");
    expect(s.state.memory).toBe(2);
  });
  it("suspends itself, adds all revealed blue Tamers and bottoms the rest", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT11-029", as: "aero" },
          { card: "BT1-009", as: "spare" },
        ],
        deck: [
          "BT1-009",
          { card: "BT11-090", as: "blue1" },
          { card: "BT11-112", as: "blue2" },
          { card: "BT1-009", as: "rest" },
          "BT1-009",
          { card: "BT11-090", as: "blue3" },
          { card: "BT11-112", as: "blue4" },
          { card: "BT1-009", as: "rest2" },
          "BT1-009",
        ],
      },
      1: { deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"], security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"] },
    });
    s.state.memory = 10;
    s.state.isFirstPlayersFirstTurn = false;
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const effect = observe(s.engine).activatableEffects(s.perm("aero")) as { effectKey: string }[];

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("aero").topCard!.instanceId,
        effectKey: effect[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("blue1").instanceId) &&
        s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("blue2").instanceId),
    );

    expect(s.perm("aero").isSuspended).toBe(true);
    const handIds = s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
    expect(handIds).toContain(s.inst("blue1").instanceId);
    expect(handIds).toContain(s.inst("blue2").instanceId);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("rest").instanceId);

    await advance(s.engine).verb.unsuspend([s.perm("aero").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("aero").topCard!.instanceId,
        effectKey: effect[0]!.effectKey,
      }).ok,
    ).toBe(false);

    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const nextEffect = observe(s.engine).activatableEffects(s.perm("aero")) as { effectKey: string }[];
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("aero").topCard!.instanceId,
        effectKey: nextEffect[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("blue3").instanceId) &&
        s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("blue4").instanceId),
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("blue3").instanceId, s.inst("blue4").instanceId]),
    );
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("rest2").instanceId);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });

  it("inherited effect activates a Rina Shinomiya On Play effect when its host attacks", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST2-10", as: "host", under: ["BT11-029"] },
            { card: "BT11-112", as: "rina" },
            { card: "BT11-023", as: "veemon" },
            { card: "BT11-023", as: "veemonNext" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "opponentSpare" }],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds: preferred },
    );

    const hostId = s.perm("host").permanentId;
    preferred.push(s.inst("veemon").instanceId, s.inst("veemonNext").instanceId);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: hostId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(observe(s.engine).hasKeyword(s.perm("veemon"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("veemon"), "Evade")).toBe(true);

    await advance(s.engine).verb.unsuspend([hostId]);
    preferred.splice(0, 1);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: hostId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(observe(s.engine).hasKeyword(s.perm("veemonNext"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("veemonNext"), "Evade")).toBe(false);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    s.state.turnSeat = 0;
    s.state.memory = 3;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: hostId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(observe(s.engine).hasKeyword(s.perm("veemonNext"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("veemonNext"), "Evade")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });

  it("does not activate Rina for another Digimon's attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT11-033", as: "host", under: ["BT11-029"] },
            { card: "BT11-027", as: "other" },
            { card: "BT11-112", as: "rina" },
            { card: "BT11-023", as: "veemon" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await advance(s.engine).fireSubTrigger("whenAttacking", { attackerPermanentId: s.perm("other").permanentId });
    expect(observe(s.engine).hasKeyword(s.perm("veemon"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("veemon"), "Evade")).toBe(false);
  });

  it("does not activate Rina when an opposing Digimon attacks", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT11-033", as: "host", under: ["BT11-029"] },
            { card: "BT11-112", as: "rina" },
            { card: "BT11-023", as: "veemon" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await advance(s.engine).fireSubTrigger("whenAttacking", {
      attackerPermanentId: s.perm("opponent").permanentId,
    });
    expect(observe(s.engine).hasKeyword(s.perm("veemon"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("veemon"), "Evade")).toBe(false);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT11-029")).toBe(false);
  });
});
