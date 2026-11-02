import { getCardDefinition, getCompiledCard, type DecisionResponse } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../BT20/BT20-016.js";
import "./EX3-063.js";
import "./EX3-073.js";

interface DecisionPayload {
  candidateInstanceIds?: string[];
  min?: number;
  max?: number;
  timing?: string;
  effectText?: string;
  promptKey?: string;
}

function payload(s: EngineSetup): DecisionPayload {
  return JSON.parse(s.state.pendingDecision!.payloadJson) as DecisionPayload;
}

function respond(s: EngineSetup, response: DecisionResponse): void {
  expect(
    s.engine.applyIntent(s.state.pendingDecision!.seat, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response,
    }),
  ).toEqual({ ok: true });
}

describe("EX3-063 Imperialdramon: Dragon Mode", () => {
  it("matches the official errata identity, evolution routes, DNA materials, and full text", () => {
    const definition = getCardDefinition("EX3-063")!;
    expect(definition).toMatchObject({
      cardId: "EX3-063",
      nameEn: "Imperialdramon: Dragon Mode",
      colors: ["Purple", "Red"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Ancient Dragon"],
      rarity: "SR",
      imageId: "EX3-063-Errata",
    });
    expect(definition.evoCosts).toEqual([
      { color: "Purple", level: 5, memoryCost: 4 },
      { color: "Red", level: 5, memoryCost: 4 },
    ]);
    expect(definition.effectText).toBe(
      "DNA Digivolution: 0 from purple Lv.5 + red Lv.5[When Digivolving] If DNA digivolving, your opponent chooses 1 of their Digimon. Delete all of their other Digimon. Then, ＜Blitz＞.[When Attacking][Once Per Turn] This Digimon gets +2000 DP for the turn. Then, this Digimon may digivolve into [Imperialdramon: Fighter Mode] in your hand for the digivolution cost.",
    );
    expect(definition.inheritedEffectText).toBeUndefined();
    expect(getCompiledCard("EX3-063")).toMatchObject({
      coverage: "full",
      residual: [],
      dnaDigivolveRequirement: [
        {
          cost: 0,
          materials: [
            { color: "Purple", level: 5 },
            { color: "Red", level: 5 },
          ],
        },
      ],
      effects: [
        {
          trigger: "WhenDigivolving",
          actions: [
            { kind: "Delete", condition: { kind: "isDnaDigivolving" }, target: { count: "all" } },
            { kind: "GainKeyword", keyword: { keyword: "Blitz" } },
          ],
        },
        {
          trigger: "WhenAttacking",
          frequency: "OncePerTurn",
          actions: [
            { kind: "ModifyDP", amount: 2000 },
            {
              kind: "Digivolve",
              into: { nameOrTrait: [{ tokens: ["Imperialdramon: Fighter Mode"], match: "nameExact" }] },
              costOverride: 2,
              optional: true,
            },
          ],
        },
      ],
    });
  });

  it("rejects DNA evolution without purple and red level-5 materials", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX3-010", as: "redLevel5" },
          { card: "BT1-028", as: "invalidLevel3" },
        ],
        hand: [{ card: "EX3-063", as: "dragonMode" }],
      },
    });
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("redLevel5").permanentId, s.perm("invalidLevel3").permanentId],
        instanceId: s.inst("dragonMode").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("EX3-063");
    expect(s.perm("redLevel5").topCard.cardId).toBe("EX3-010");
    expect(s.perm("invalidLevel3").topCard.cardId).toBe("BT1-028");
  });

  it("DNA digivolves for 0, lets the opponent choose the survivor, deletes the others, and gains Blitz", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX3-010", as: "redLevel5" },
            { card: "EX3-061", as: "purpleLevel5" },
          ],
          hand: [{ card: "EX3-063", as: "dragonMode" }],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-028", as: "first" },
            { card: "BT1-029", as: "survivor" },
            { card: "BT1-030", as: "third" },
          ],
        },
      },
      { autoAcceptOptional: false, autoOrderTriggers: true },
    );
    s.state.memory = 2;
    await s.ready();
    const firstCard = s.perm("first").topCard.instanceId;
    const thirdCard = s.perm("third").topCard.instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("redLevel5").permanentId, s.perm("purpleLevel5").permanentId],
        instanceId: s.inst("dragonMode").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    expect(s.state.pendingDecision?.kind).toBe("chooseTargets");

    expect(s.state.pendingDecision?.seat).toBe(1);
    expect(s.decisions.at(-1)!.req).toMatchObject({
      kind: "chooseTargets",
      seat: 1,
      sourceCardId: "EX3-063",
      options: { min: 1, max: 1, timing: "WhenDigivolving" },
    });
    expect(payload(s).candidateInstanceIds).toEqual(
      expect.arrayContaining([
        s.perm("first").permanentId,
        s.perm("survivor").permanentId,
        s.perm("third").permanentId,
      ]),
    );
    expect(payload(s).effectText).toContain("your opponent chooses 1 of their Digimon");
    respond(s, { kind: "chooseTargets", instanceIds: [s.perm("survivor").permanentId] });
    await settle(
      () =>
        s.state.players[1]!.battleArea.length === 1 &&
        observe(s.engine).hasKeyword(s.state.players[0]!.battleArea[0]!, "Blitz"),
    );

    const dragonMode = s.state.players[0]!.battleArea[0]!;
    expect(s.state.memory).toBe(2);
    expect(dragonMode.stack.map(({ cardId }) => cardId)).toEqual(expect.arrayContaining(["EX3-010", "EX3-061"]));
    expect(s.state.players[1]!.battleArea[0]!.permanentId).toBe(s.perm("survivor").permanentId);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([firstCard, thirdCard]),
    );
    expect(observe(s.engine).hasKeyword(dragonMode, "Blitz")).toBe(true);
    assertNoLoudGap(s);
  });

  it("GitHub #5179: ordinary digivolution costs 4 and grants Blitz without the DNA deletion", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-061", as: "base" }],
        hand: [{ card: "EX3-063", as: "dragonMode" }],
        deck: ["BT1-010"],
      },
      1: {
        battleArea: [
          { card: "BT1-028", as: "first" },
          { card: "BT1-029", as: "second" },
        ],
      },
    });
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("dragonMode").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX3-063" && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(2);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Blitz")).toBe(true);
    expect(s.decisions).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("Q2891: effect-origin DNA during the opponent turn grants Blitz but cannot authorize an attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT20-016", dp: 8000, suspended: true, as: "paildramon", under: ["BT20-010"] },
            { card: "BT20-074", as: "dinobeemon", under: ["BT20-072"] },
          ],
          hand: [{ card: "EX3-063", as: "dragonMode" }],
        },
        1: {
          battleArea: [
            { card: "BT20-012", dp: 10000, as: "attacker" },
            { card: "BT1-029", as: "otherOpponent" },
          ],
          security: ["BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: false, autoOrderTriggers: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("paildramon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    expect(s.state.pendingDecision?.seat).toBe(1);
    expect(s.decisions.at(-1)!.req).toMatchObject({
      kind: "chooseTargets",
      seat: 1,
      sourceCardId: "EX3-063",
      options: { min: 1, max: 1, timing: "WhenDigivolving" },
    });
    respond(s, { kind: "chooseTargets", instanceIds: [s.perm("otherOpponent").permanentId] });
    await settle(
      () =>
        s.state.players[0]!.battleArea.length === 1 &&
        observe(s.engine).hasKeyword(s.state.players[0]!.battleArea[0]!, "Blitz"),
    );
    const dragonMode = s.state.players[0]!.battleArea[0]!;
    expect(s.state.turnSeat).toBe(1);
    expect(observe(s.engine).hasKeyword(dragonMode, "Blitz")).toBe(true);
    expect(dragonMode.stack.map(({ cardId }) => cardId)).toEqual(expect.arrayContaining(["BT20-016", "BT20-074"]));
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("otherOpponent").permanentId,
    ]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: dragonMode.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: false, reason: "not-your-turn" });
    assertNoLoudGap(s);
  });

  it("When Attacking gains +2000 DP, may pay 2 to become Fighter Mode, and preserves the buff", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX3-063", under: ["EX3-061", "EX3-010"], as: "dragonMode" }],
          hand: [
            { card: "EX3-073", as: "fighterMode" },
            { card: "EX3-073", as: "otherFighterMode" },
            { card: "BT3-031", as: "wrongImperialdramon" },
          ],
        },
        1: { security: ["BT1-012"] },
      },
      { autoSelectCards: false, autoOrderTriggers: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("dragonMode").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(s.state.pendingDecision?.kind).toBe("optional");
    expect(s.perm("dragonMode").currentDP).toBe(14000);
    expect(s.decisions.at(-1)!.req).toMatchObject({
      kind: "optional",
      sourceCardId: "EX3-063",
      options: { timing: "WhenAttacking" },
    });
    expect(payload(s).effectText).toContain("may digivolve into [Imperialdramon: Fighter Mode]");
    respond(s, { kind: "optional", accept: true });

    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(s.state.pendingDecision?.kind).toBe("selectCards");
    expect(s.decisions.at(-1)!.req).toMatchObject({
      sourceCardId: "EX3-063",
      options: {
        candidateInstanceIds: [s.inst("fighterMode").instanceId, s.inst("otherFighterMode").instanceId],
        visibleInstanceIds: [
          s.inst("fighterMode").instanceId,
          s.inst("otherFighterMode").instanceId,
          s.inst("wrongImperialdramon").instanceId,
        ],
        min: 0,
        max: 1,
        timing: "WhenAttacking",
      },
    });
    respond(s, { kind: "selectCards", instanceIds: [s.inst("fighterMode").instanceId] });

    await settle(() => s.perm("dragonMode").topCard.cardId === "EX3-073");
    expect(s.perm("dragonMode").topCard.cardId).toBe("EX3-073");
    if (s.state.pendingDecision?.kind === "optional") respond(s, { kind: "optional", accept: false });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(3);
    expect(s.perm("dragonMode").currentDP).toBe(15000);
    expect(s.perm("dragonMode").stack.map(({ cardId }) => cardId)).not.toContain("EX3-063");
    expect(s.state.players[0]!.deck.at(-1)?.cardId).toBe("EX3-063");
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
      s.inst("wrongImperialdramon").instanceId,
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
      s.inst("otherFighterMode").instanceId,
    );
    assertNoLoudGap(s);
  });

  it("may decline Fighter Mode while keeping the +2000 DP, then does not trigger again that turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-063", as: "dragonMode" }],
        hand: [{ card: "EX3-073", as: "fighterMode" }],
      },
      1: { security: ["BT1-013", "BT1-014"] },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("dragonMode").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(s.state.pendingDecision?.kind).toBe("optional");
    respond(s, { kind: "optional", accept: false });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[1]!.security.length === 1 &&
        !observe(s.engine).isAttacking(),
    );
    expect(s.perm("dragonMode").currentDP).toBe(14000);

    await advance(s.engine).verb.unsuspend([s.perm("dragonMode").permanentId]);
    const decisionCount = s.decisions.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("dragonMode").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.perm("dragonMode").currentDP).toBe(14000);
    expect(s.decisions).toHaveLength(decisionCount);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("fighterMode").instanceId);
    assertNoLoudGap(s);
  });

  it("without Fighter Mode in hand, the mandatory DP bonus resolves with no impossible prompt", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-063", as: "dragonMode" }],
        hand: [{ card: "BT3-031", as: "otherImperialdramon" }],
      },
      1: { security: ["BT1-009"] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("dragonMode").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.security.length === 0);

    expect(s.perm("dragonMode").currentDP).toBe(14000);
    expect(s.decisions).toHaveLength(0);
    assertNoLoudGap(s);
  });
});
