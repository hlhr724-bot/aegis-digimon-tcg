import { Phase, getCardDefinition, getCompiledCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./ST2-13.js";
import "../BT1/BT1-009.js";
import "../BT1/BT1-018.js";
import "../BT1/BT1-019.js";
import "../BT3/BT3-046.js";
import "../BT3/BT3-061.js";
import "../BT3/BT3-077.js";
import "../BT5/BT5-069.js";
import "../BT6/BT6-021.js";

describe("ST2-13 Hammer Spark", () => {
  it("matches both printed memory effects in the complete IR artifact", () => {
    const definition = getCardDefinition("ST2-13")!;
    const compiled = getCompiledCard("ST2-13")!;

    expect(definition.kinds).toEqual(["Option"]);
    expect(definition.colors).toEqual(["Blue"]);
    expect(definition.playCost).toBe(0);
    expect(definition.effectText).toContain("Gain 1 memory");
    expect(definition.securityEffectText).toContain("Gain 2 memory");
    expect(compiled.effects).toEqual([
      { trigger: "Main", actions: [{ effectTextPart: "[Main] Gain 1 memory.", kind: "GainMemory", amount: 1 }] },
      { trigger: "Security", actions: [{ kind: "GainMemory", amount: 2 }], isSecurity: true },
    ]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("gains 1 memory from Main", async () => {
    const s = setupEngine({ 0: { battleArea: ["ST2-03"], hand: [{ card: "ST2-13", as: "option" }] } });
    s.state.memory = 0;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.memory === 1);
    expect(s.state.memory).toBe(1);
  });

  it("gains 2 memory from security", async () => {
    const s = setupEngine({
      0: { security: [{ card: "ST2-13", as: "securityOption" }] },
      1: { battleArea: ["BT1-009"] },
    });
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.state.players[1]!.battleArea[0]!.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0 && !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(-2);
  });
});

describe("ST2-13 Hammer Spark — KB Q&A rulings", () => {
  async function attackIntoHammerSpark(memoryBlocker?: { cardId: string; side: "attacker" | "hammerSparkOwner" }) {
    const blockerOnSide = (side: "attacker" | "hammerSparkOwner") =>
      memoryBlocker?.side === side ? [memoryBlocker.cardId] : [];
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-019", as: "attacker" }, ...blockerOnSide("attacker")] },
      1: { battleArea: blockerOnSide("hammerSparkOwner"), security: [{ card: "ST2-13", as: "hammerSpark" }] },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && !observe(s.engine).isAttacking(), 5000);
    return s;
  }

  it("ends the attacker's turn only after a Security Attack + attack finishes its remaining checks (Q623)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT5-069", as: "attacker" }] },
      1: { security: ["ST2-13", "BT1-009"] },
    });
    s.state.memory = 1;
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Main);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await turn;

    expect(s.state.memory).toBe(-1);
    expect(s.state.players[1]!.security).toHaveLength(0);
    const checkedIndexes = s.events.flatMap((event, index) => (event.kind === "securityChecked" ? [index] : []));
    const turnEndedIndex = s.events.findIndex(
      (event) => event.kind === "turnEnded" && event.endingSeat === 0 && event.nextSeat === 1,
    );
    expect(checkedIndexes).toHaveLength(2);
    expect(
      checkedIndexes.map((index) => {
        const event = s.events[index]!;
        return event.kind === "securityChecked" ? event.revealedCardId : undefined;
      }),
    ).toEqual(["ST2-13", "BT1-009"]);
    expect(turnEndedIndex).toBeGreaterThan(checkedIndexes[1]!);
  });

  it("removes Flarerizamon's memory-gated Security Attack +1 mid-attack, so no second check happens (Q881)", async () => {
    async function flarerizamonAttack(startingMemory: number) {
      const s = setupEngine({
        0: { battleArea: [{ card: "BT1-018", as: "attacker" }] },
        1: { security: ["ST2-13", "BT1-009"] },
      });
      s.state.memory = startingMemory;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.memory === startingMemory - 2 && !observe(s.engine).isAttacking(), 5000);
      return s;
    }

    const droppedBelowThree = await flarerizamonAttack(3);
    expect(droppedBelowThree.state.memory).toBe(1);
    expect(droppedBelowThree.state.players[1]!.security.map((card) => card.cardId)).toEqual(["BT1-009"]);

    const stayedAtThree = await flarerizamonAttack(5);
    expect(stayedAtThree.state.memory).toBe(3);
    expect(stayedAtThree.state.players[1]!.security).toHaveLength(0);
  });

  it("gives its owner no memory from its security effect while the attacker has Terriermon in play (Q1081)", async () => {
    const attackerHasTerriermon = await attackIntoHammerSpark({ cardId: "BT3-046", side: "attacker" });
    expect(attackerHasTerriermon.state.memory).toBe(3);

    const ownerHasTerriermon = await attackIntoHammerSpark({ cardId: "BT3-046", side: "hammerSparkOwner" });
    expect(ownerHasTerriermon.state.memory).toBe(1);

    const noTerriermon = await attackIntoHammerSpark();
    expect(noTerriermon.state.memory).toBe(1);
  });

  it("gives its owner no memory from its security effect while the attacker has Chuumon in play (Q1088)", async () => {
    const attackerHasChuumon = await attackIntoHammerSpark({ cardId: "BT3-061", side: "attacker" });
    expect(attackerHasChuumon.state.memory).toBe(3);

    const ownerHasChuumon = await attackIntoHammerSpark({ cardId: "BT3-061", side: "hammerSparkOwner" });
    expect(ownerHasChuumon.state.memory).toBe(1);

    const noChuumon = await attackIntoHammerSpark();
    expect(noChuumon.state.memory).toBe(1);
  });

  it("gives its owner no memory from its security effect while the attacker has Gazimon in play (Q1098)", async () => {
    const attackerHasGazimon = await attackIntoHammerSpark({ cardId: "BT3-077", side: "attacker" });
    expect(attackerHasGazimon.state.memory).toBe(3);

    const ownerHasGazimon = await attackIntoHammerSpark({ cardId: "BT3-077", side: "hammerSparkOwner" });
    expect(ownerHasGazimon.state.memory).toBe(1);

    const noGazimon = await attackIntoHammerSpark();
    expect(noGazimon.state.memory).toBe(1);
  });

  it("gives its owner no memory from its security effect while the attacker has ModokiBetamon in play (Q1416)", async () => {
    const attackerHasModokiBetamon = await attackIntoHammerSpark({ cardId: "BT6-021", side: "attacker" });
    expect(attackerHasModokiBetamon.state.memory).toBe(3);

    const ownerHasModokiBetamon = await attackIntoHammerSpark({ cardId: "BT6-021", side: "hammerSparkOwner" });
    expect(ownerHasModokiBetamon.state.memory).toBe(1);

    const noModokiBetamon = await attackIntoHammerSpark();
    expect(noModokiBetamon.state.memory).toBe(1);
  });
});
