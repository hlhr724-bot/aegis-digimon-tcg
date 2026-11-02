import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX10-033.js";
import "../index.js";

const MINERAL_ROCK_TRASH = [
  { card: "BT10-062", as: "mineral" },
  { card: "EX10-003", as: "egg" },
  { card: "BT4-065", as: "rock" },
  { card: "BT1-009", as: "nearMiss" },
];

describe("EX10-033 Pyramidimon", () => {
  it("records the exact catalog", () => {
    expect(getCardDefinition("EX10-033")).toMatchObject({
      cardId: "EX10-033",
      nameEn: "Pyramidimon",
      colors: ["Black"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [{ color: "Black", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Mineral", "LIBERATOR"],
      maxCountInDeck: 4,
    });
    const definition = getCardDefinition("EX10-033")!;
    expect(definition.effectText).toBe(
      "＜Fragment (3)＞ \n[When Digivolving] [When Attacking] [Once Per Turn] You may place up to 3 [Mineral] or [Rock]\u00A0trait cards from your trash as this Digimon's bottom digivolution cards.\n[When Digivolving] [When Attacking] By trashing up to 3 [Mineral] or [Rock]\u00A0trait cards from any of your Digimon's digivolution cards, to 1 of your opponent's Digimon, reduce the play cost by 2 until their turn ends for each card trashed.",
    );
    expect(definition.inheritedEffectText ?? "").toBe("");
    expect(definition.securityEffectText ?? "").toBe("");
  });

  it("records the compiled IR: Fragment, the shared once-per-turn placement, the scaled reduction", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects?.find((effect) => effect.trigger === "Static")).toMatchObject({
      keywords: [{ keyword: "Fragment", amount: 3 }],
    });

    const placeEffects = compiled.effects?.filter((effect) => effect.actions?.[0]?.kind === "PlaceUnder");
    expect(placeEffects?.map((effect) => [effect.trigger, effect.frequency, effect.sharedUseKey])).toEqual([
      ["WhenDigivolving", "OncePerTurn", "ir-shared-0"],
      ["WhenAttacking", "OncePerTurn", "ir-shared-0"],
    ]);
    for (const effect of placeEffects ?? []) {
      expect(effect.optional).toBe(true);
      expect(effect.actions?.[0]).toMatchObject({
        kind: "PlaceUnder",
        position: "bottom",
        target: {
          filter: { zone: "trash", controller: "mine", nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }] },
          count: 3,
          upTo: true,
          minimum: 1,
          from: ["trash"],
        },
      });
    }

    const reductions = compiled.effects?.filter((effect) => effect.actions?.[0]?.kind === "CostModifier");
    expect(reductions?.map((effect) => [effect.trigger, effect.frequency])).toEqual([
      ["WhenDigivolving", undefined],
      ["WhenAttacking", undefined],
    ]);
    for (const effect of reductions ?? []) {
      expect(effect.actions?.[0]).toMatchObject({
        kind: "CostModifier",
        mode: "reduce",
        costType: "play",
        amount: 2,
        existingPermanent: true,
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        duration: "untilOpponentTurnEnd",
        cost: {
          kind: "trash",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }],
            },
            count: 3,
            upTo: true,
            minimum: 1,
            from: ["digivolutionCards"],
          },
        },
        scaling: { per: 1, usePaidCount: true, unit: "cards" },
        abortOnDecline: true,
      });
    }
  });

  it("Q5095/Q5096: digivolving places up to 3 [Mineral]/[Rock] cards, a Digi-Egg included, at the bottom", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-064", as: "base" }],
          hand: [{ card: "EX10-033", as: "pyramid" }],
          deck: ["BT1-013", "BT1-014"],
          trash: MINERAL_ROCK_TRASH,
        },
        1: { security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred, declinePrompts: ["Pay cost:"] },
    );
    preferred.push(s.inst("mineral").instanceId, s.inst("egg").instanceId, s.inst("rock").instanceId);
    await s.ready();
    s.state.memory = 4;
    const baseInstanceId = s.inst("base").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").stack.length === 4);

    const evolved = s.perm("base");
    expect(evolved.topCard!.cardId).toBe("EX10-033");
    expect(observe(s.engine).hasKeyword(evolved, "Fragment")).toBe(true);
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-013"]);

    expect(evolved.stack.map((card) => card.instanceId).slice(3)).toEqual([baseInstanceId]);
    expect(
      evolved.stack
        .slice(0, 3)
        .map((card) => card.instanceId)
        .sort(),
    ).toEqual([s.inst("mineral").instanceId, s.inst("egg").instanceId, s.inst("rock").instanceId].sort());
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT1-009"]);

    const placement = s.decisions.find(
      ({ req }) => req.kind === "selectCards" && (req.options?.candidateInstanceIds ?? []).length === 3,
    );
    expect(placement?.req.options).toMatchObject({ min: 1, max: 3 });
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q5096/Q5099: declining both processing conditions keeps every eligible source", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-064", as: "base" },
            { card: "BT10-062", as: "otherHost", under: [{ card: "BT4-065", as: "rockA" }] },
          ],
          hand: [{ card: "EX10-033", as: "pyramid" }],
          deck: ["BT1-013", "BT1-014"],
          trash: MINERAL_ROCK_TRASH,
        },
        1: { battleArea: [{ card: "BT3-067", as: "tankmon" }], security: ["BT1-009"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 4;
    const baseInstanceId = s.inst("base").instanceId;
    const rockInstanceId = s.inst("rockA").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.decisions.filter(({ req }) => req.kind === "optional").length >= 2 && s.state.pendingDecision === undefined,
    );
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseInstanceId]);
    expect(s.perm("otherHost").stack.map((card) => card.instanceId)).toEqual([rockInstanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual([
      "BT10-062",
      "EX10-003",
      "BT4-065",
      "BT1-009",
    ]);
    const tankmon = getCardDefinition("BT3-067")!;
    expect(
      advance(s.engine).ledgers.modifiers.playCostFor(
        { def: tankmon, controllerSeat: 1, permanentId: s.perm("tankmon").permanentId },
        6,
      ),
    ).toBe(6);
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-013"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q5097/Q5098/Q5100: trashes 3 cards across two stacks, drops a cost-6 Digimon to 0 and lets Landramon delete it", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-064", as: "base", under: [{ card: "EX10-028", as: "landramon" }] },
            {
              card: "BT10-062",
              as: "otherHost",
              under: [
                { card: "BT4-065", as: "rockA" },
                { card: "BT4-065", as: "rockB" },
              ],
            },
          ],
          hand: [{ card: "EX10-033", as: "pyramid" }],
          deck: ["BT1-013", "BT1-014"],
          trash: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT3-067", as: "chosen" },
            { card: "BT3-067", as: "spared" },
          ],
          security: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.inst("landramon").instanceId,
      s.inst("rockA").instanceId,
      s.inst("rockB").instanceId,
      s.perm("chosen").topCard!.instanceId,
    );
    await s.ready();
    s.state.memory = 4;
    const chosenPermanentId = s.perm("chosen").permanentId;
    const sparedPermanentId = s.perm("spared").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    await settle(() => false, 40);

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("landramon").instanceId, s.inst("rockA").instanceId, s.inst("rockB").instanceId]),
    );
    expect(s.perm("otherHost").stack).toHaveLength(0);

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([sparedPermanentId]);
    const modifiers = advance(s.engine).ledgers.modifiers;
    const tankmon = getCardDefinition("BT3-067")!;
    expect(modifiers.playCostFor({ def: tankmon, controllerSeat: 1, permanentId: sparedPermanentId }, 6)).toBe(6);
    expect(modifiers.playCostFor({ def: tankmon, controllerSeat: 1, permanentId: chosenPermanentId }, 5)).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("[Once Per Turn] is shared by both triggers: digivolving spends it, the same turn's attack cannot place, next turn can", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-064", as: "base" }],
          hand: [{ card: "EX10-033", as: "pyramid" }, "BT1-013"],
          deck: ["BT1-013", "BT1-014", "BT1-009", "BT1-013"],
          trash: [
            { card: "BT10-062", as: "first" },
            { card: "BT4-065", as: "second" },
            { card: "BT10-062", as: "third" },
            { card: "BT4-065", as: "fourth" },
            { card: "BT10-062", as: "fifth" },
            { card: "BT4-065", as: "sixth" },
          ],
          security: ["BT1-009", "BT1-013"],
        },
        1: { security: ["BT1-009", "BT1-013", "BT1-014"], deck: ["BT1-009", "BT1-013"], hand: ["BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Pay cost:"] },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").stack.length === 4);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId !== "BT1-009")).toHaveLength(3);

    const stackAfterDigivolve = s.perm("base").stack.length;
    const trashAfterDigivolve = s.state.players[0]!.trash.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2);
    await settle(() => false, 40);

    expect(s.perm("base").stack).toHaveLength(stackAfterDigivolve);
    expect(s.state.players[0]!.trash).toHaveLength(trashAfterDigivolve);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").stack.length === stackAfterDigivolve + 3);

    expect(s.state.players[0]!.trash.filter((card) => card.cardId !== "BT1-009")).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("refuses an illegal digivolution source: a Red Lv.3 is neither Black nor Lv.5", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "redRookie" }],
        hand: [{ card: "EX10-033", as: "pyramid" }],
        deck: ["BT1-013"],
      },
    });
    await s.ready();
    s.state.memory = 6;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redRookie").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("redRookie").topCard!.cardId).toBe("BT1-009");
    expect(s.state.memory).toBe(6);
  });

  const orderingBoard = () => ({
    0: {
      battleArea: [{ card: "BT10-064", as: "base" }],
      hand: [{ card: "EX10-033", as: "pyramid" }],
      deck: ["BT1-013", "BT1-014"],
      trash: [
        { card: "BT10-062", as: "mineral" },
        { card: "BT4-065", as: "rock" },
        { card: "BT10-062", as: "mineral2" },
      ],
    },
    1: { battleArea: [{ card: "BT3-067", as: "tankmon" }], security: ["BT1-009"] },
  });

  it("Q5094: the order choice is offered, and placing first gives the reduction 3 cards to trash", async () => {
    const s = setupEngine(orderingBoard(), {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferTriggerKeys: ["EX10-033/ir-shared-0"],
    });
    await s.ready();
    s.state.memory = 4;
    const tankmonPermanentId = s.perm("tankmon").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.length === 3);
    await settle(() => false, 40);

    const ordering = s.decisions.find(({ req }) => req.kind === "orderTriggers");
    expect(ordering?.req.options?.triggerKeys?.length).toBe(2);
    expect((ordering?.req.options?.triggerKeys ?? []).map((key) => key.split("::")[1]).sort()).toEqual([
      "EX10-033/ir-7-1",
      "EX10-033/ir-shared-0",
    ]);

    expect(s.perm("base").stack).toHaveLength(1);
    expect(s.state.players[0]!.trash).toHaveLength(3);
    const modifiers = advance(s.engine).ledgers.modifiers;
    const tankmon = getCardDefinition("BT3-067")!;
    expect(modifiers.playCostFor({ def: tankmon, controllerSeat: 1, permanentId: tankmonPermanentId }, 6)).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q5094/Q5099: reduction first still pays with the single eligible card for -2", async () => {
    const s = setupEngine(orderingBoard(), {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferTriggerKeys: ["EX10-033/ir-7-1"],
    });
    await s.ready();
    s.state.memory = 4;
    const tankmonPermanentId = s.perm("tankmon").permanentId;
    const baseInstanceId = s.inst("base").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").stack.length === 3);
    await settle(() => false, 40);

    expect(s.perm("base").stack.map((card) => card.instanceId)).not.toContain(baseInstanceId);
    const modifiers = advance(s.engine).ledgers.modifiers;
    const tankmon = getCardDefinition("BT3-067")!;
    expect(modifiers.playCostFor({ def: tankmon, controllerSeat: 1, permanentId: tankmonPermanentId }, 6)).toBe(4);
  });
});
