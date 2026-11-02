import { describe, expect, it } from "vitest";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { effectiveStaticNames } from "@aegis/shared/cards/effectiveNames";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle, type CardSpec } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-045";

type RevealParams = {
  deck: CardSpec[];
  prefer?: string[];
};

async function playLiollmon({ deck, prefer = [] }: RevealParams) {
  const preferred: string[] = [];
  const s = setupEngine(
    { 0: { hand: [{ card: "BT27-045", as: "liollmon" }], deck } },
    { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
  );
  preferred.push(...prefer.map((alias) => s.inst(alias).instanceId));
  s.state.memory = 3;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("liollmon").instanceId })).toEqual({
    ok: true,
  });
  await settle(
    () =>
      s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT27-045") &&
      !s.state.pendingDecision,
  );
  expect(s.state.memory).toBe(0);
  return s;
}

describe("Liollmon reveal, alternate digivolution, and inherited battle memory", () => {
  it("encodes two independent reveal picks, the inherited memory gain, and both alternate routes", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Frimon", "Kyaromon"], cost: 0, isAlternate: true },
      { level: 2, traits: ["ACCEL"], cost: 0, isAlternate: true },
    ]);
    expect(compiled.effects.find((effect) => effect.trigger === "OnPlay")?.actions).toMatchObject([
      { kind: "RevealAdd", revealCount: 3, rest: "deckBottom", add: [{ count: 1 }, { count: 1 }] },
    ]);
    expect(compiled.effects.find((effect) => effect.isInherited)).toMatchObject({
      trigger: "YourTurn",
      frequency: "OncePerTurn",
      actions: [{ kind: "SubTrigger", event: "whenBattleWon", sourceFilter: { isSelfRef: true } }],
    });
  });

  it("treats this card as including Leomon in its name, unlike the older Liollmon", () => {
    expect(effectiveStaticNames(requireCardDefinition("BT27-045"))).toContain("Leomon");
    expect(effectiveStaticNames(requireCardDefinition("BT1-050"))).not.toContain("Leomon");
  });

  it("adds one Leomon-name card and one Unique card, then bottoms the miss beneath the deck", async () => {
    const s = await playLiollmon({
      deck: [
        { card: "BT14-048", as: "leomon" },
        { card: "BT20-037", as: "unique" },
        { card: "BT1-009", as: "miss" },
        { card: "BT1-013", as: "unrevealed" },
      ],
    });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("leomon").instanceId, s.inst("unique").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("miss").instanceId,
    ]);
  });

  it.each([
    ["Boss", "BT3-058"],
    ["ACCEL", "BT20-039"],
  ])("accepts a %s trait card for the trait pick", async (_trait, card) => {
    const s = await playLiollmon({
      deck: [
        { card: "BT1-042", as: "leomon" },
        { card, as: "traitCard" },
        { card: "BT1-009", as: "miss" },
      ],
    });
    expect(s.state.players[0]!.hand.map((entry) => entry.instanceId).sort()).toEqual(
      [s.inst("leomon").instanceId, s.inst("traitCard").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((entry) => entry.instanceId)).toEqual([s.inst("miss").instanceId]);
  });

  it("adds only one Leomon-name card when two are revealed", async () => {
    const s = await playLiollmon({
      deck: [
        { card: "BT14-048", as: "first" },
        { card: "BT1-042", as: "second" },
        { card: "BT20-039", as: "accel" },
      ],
      prefer: ["first"],
    });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("first").instanceId, s.inst("accel").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("second").instanceId]);
  });

  it("adds only one trait card when two are revealed", async () => {
    const s = await playLiollmon({
      deck: [
        { card: "BT3-058", as: "boss" },
        { card: "BT20-037", as: "unique" },
        { card: "BT14-048", as: "leomon" },
      ],
      prefer: ["leomon", "unique"],
    });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("leomon").instanceId, s.inst("unique").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("boss").instanceId]);
  });

  it("lets a card matching both picks satisfy only one of them", async () => {
    const s = await playLiollmon({
      deck: [
        { card: "BT4-061", as: "bancho" },
        { card: "BT1-009", as: "miss" },
        { card: "BT1-050", as: "oldLiollmon" },
      ],
    });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("bancho").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("miss").instanceId, s.inst("oldLiollmon").instanceId].sort(),
    );
  });

  it("assigns a dual-matching card to the Leomon pick so an ACCEL card fills the trait pick", async () => {
    const s = await playLiollmon({
      deck: [
        { card: "BT4-061", as: "bancho" },
        { card: "BT20-039", as: "accel" },
        { card: "BT1-009", as: "miss" },
      ],
    });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("bancho").instanceId, s.inst("accel").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("miss").instanceId]);
  });

  it("lets a revealed Liollmon fill the Leomon pick through its name rule", async () => {
    const s = await playLiollmon({
      deck: [
        { card: "BT27-045", as: "revealedLiollmon" },
        { card: "BT20-039", as: "accel" },
        { card: "BT1-050", as: "oldLiollmon" },
      ],
    });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("revealedLiollmon").instanceId, s.inst("accel").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("oldLiollmon").instanceId]);
  });

  it("bottoms all three cards when none match either pick", async () => {
    const s = await playLiollmon({
      deck: [
        { card: "BT1-050", as: "oldLiollmon" },
        { card: "BT1-009", as: "first" },
        { card: "BT1-013", as: "second" },
      ],
    });
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("oldLiollmon").instanceId, s.inst("first").instanceId, s.inst("second").instanceId].sort(),
    );
  });

  it.each([
    ["off-color Frimon", "BT18-006", true, true, 0],
    ["off-color Kyaromon", "BT6-002", true, true, 0],
    ["green ACCEL Lv.2", "BT20-004", true, true, 0],
    ["green ACCEL Lv.2 by its printed cost", "BT20-004", false, true, 1],
    ["yellow Lv.2 without the name or trait by its printed cost", "BT1-006", false, true, 1],
    ["red Lv.2 without the name or trait", "BT1-001", true, false, 0],
  ])("digivolves from a %s", async (_label, egg, useAlternateCost, allowed, cost) => {
    const s = setupEngine({
      0: { breeding: { card: egg, as: "egg" }, hand: [{ card: "BT27-045", as: "liollmon" }], deck: ["BT1-009"] },
    });
    await s.ready();
    s.state.memory = 5;
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("egg").permanentId,
      instanceId: s.inst("liollmon").instanceId,
      useAlternateCost,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) {
      await settle(() => s.perm("egg").topCard.cardId === "BT27-045");
    }
    expect(s.state.memory).toBe(5 - cost);
    expect(s.perm("egg").topCard.cardId).toBe(allowed ? "BT27-045" : egg);
  });

  it("rejects a Lv.3 ACCEL base for the Lv.2 trait route", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT27-045", as: "base" }], hand: [{ card: "BT27-045", as: "liollmon" }] },
    });
    await s.ready();
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("liollmon").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(5);
  });

  it("gains 1 memory once per turn when its inherited host wins battles on your turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-019", as: "host", dp: 10000, under: ["BT27-045"] }] },
      1: {
        battleArea: [
          { card: "BT1-009", as: "firstVictim", suspended: true, dp: 1000 },
          { card: "BT1-009", as: "secondVictim", suspended: true, dp: 1000 },
        ],
      },
    });
    s.state.memory = 0;
    await s.ready();
    for (const victim of ["firstVictim", "secondVictim"] as const) {
      const victimId = s.perm(victim).permanentId;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("host").permanentId,
          target: { kind: "permanent", permanentId: victimId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          !observe(s.engine).isAttacking() &&
          !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === victimId),
      );
      expect(s.state.memory).toBe(1);
      if (victim === "firstVictim") {
        await advance(s.engine).verb.unsuspend([s.perm("host").permanentId]);
      }
    }
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("does not gain memory when its inherited host loses the battle", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-019", as: "host", dp: 1000, under: ["BT27-045"] }] },
      1: { battleArea: [{ card: "BT1-009", as: "defender", suspended: true, dp: 10000 }] },
    });
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.battleArea.length === 0);
    expect(s.state.memory).toBe(0);
  });

  it("does not gain memory when Liollmon itself wins a battle without being a digivolution card", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT27-045", as: "liollmon", dp: 10000 }] },
      1: { battleArea: [{ card: "BT1-009", as: "victim", suspended: true, dp: 1000 }] },
    });
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("liollmon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("victim").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[1]!.battleArea.length === 0);
    expect(s.state.memory).toBe(0);
  });

  it("does not gain memory when its inherited host wins a battle on the opponent's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-019", as: "host", dp: 10000, suspended: true, under: ["BT27-045"] }] },
      1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 1000 }] },
    });
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("host").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[1]!.battleArea.length === 0);
    expect(s.state.memory).toBe(0);
  });
});
