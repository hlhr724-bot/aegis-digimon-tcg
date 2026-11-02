import { assemblyRequirementFor, digivolutionRequirementsFor, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./EX13-036.js";

const cardId = "EX13-036";

const YELLOW_HOLY_BEAST_LV5 = "BT3-038";
const YELLOW_HOLY_BEAST_LV4 = "BT1-051";
const YELLOW_HOLY_BEAST_LV3 = "BT1-050";
const PURPLE_HOLY_BEAST_LV5 = "BT10-079";
const DATA_SQUAD_LV5 = "BT25-027";
const NEAR_TRAIT_LV5 = "ST6-09";
const NO_TRAIT_LV5 = "BT1-038";
const YELLOW_PLAIN_LV3 = "BT1-045";
const GREEN_HOLY_BEAST_LV3 = "BT4-050";
const BIG_BODY = "BT1-024";
const OTHER_BIG_BODY = "BT1-042";
const DECK = ["BT1-011", "BT1-012", "BT1-013"];

describe("EX13-036 Kentaurosmon", () => {
  it("matches the catalog identity and printed text", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      nameEn: "Kentaurosmon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12_000,
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Holy Warrior", "Royal Knight", "DATA SQUAD"],
      evoCosts: [{ color: "Yellow", level: 5, memoryCost: 3 }],
    });
    expect((getCardDefinition(cardId)?.inheritedEffectText ?? "").trim()).toBe("");
    expect((getCardDefinition(cardId)?.securityEffectText ?? "").trim()).toBe("");

    const effectText = getCardDefinition(cardId)?.effectText ?? "";
    expect(effectText).toContain("[Digivolve] Lv.5 w/[Holy Beast]/[DATA SQUAD] trait: Cost 3");
    expect(effectText).toContain("[Assembly -5] Lv.5 × Lv.4 × Lv.3, all Yellow w/[Holy Beast] trait");
    expect(effectText).toContain(
      "[Security] [On Play] 1 of your opponent's Digimon gets -7000 DP for the turn. If there are 6 or fewer total cards in both players' security stacks, instead all of their Digimon get -7000 DP for the turn.",
    );
    expect(effectText).toContain(
      "[When Digivolving] By trashing the top security card of 1 player with the most security cards, you may activate 1 of this Digimon's [Security] effects.",
    );
    expect(effectText).toContain(
      "[When Digivolving] [End of Attack] [Counter] [Once Per Turn] You may place 1 of each player's Digimon as the top security cards.",
    );
  });

  it("compiles every printed clause and nothing else", () => {
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual([
      "Security",
      "OnPlay",
      "WhenDigivolving",
      "WhenDigivolving",
      "EndOfAttack",
      "Counter",
    ]);

    const dpDrop = [
      {
        kind: "ModifyDP",
        target: { count: 1, filter: { controller: "opponent", kind: ["Digimon"], zone: "battleArea" } },
        amount: -7000,
        duration: "forTheTurn",
        condition: { kind: "totalSecurityCount", op: "gte", value: 7 },
      },
      {
        kind: "ModifyDP",
        target: { count: "all", filter: { controller: "opponent", kind: ["Digimon"], zone: "battleArea" } },
        amount: -7000,
        duration: "forTheTurn",
        condition: { kind: "totalSecurityCount", op: "lte", value: 6 },
      },
    ];
    expect(compiled.effects[0]).toMatchObject({ trigger: "Security", isSecurity: true, actions: dpDrop });
    expect(compiled.effects[1]).toMatchObject({ trigger: "OnPlay", actions: dpDrop });

    expect(compiled.effects[2]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [
        { kind: "RecoverByTrashingMostSecurity", recover: false },
        { kind: "ReactivateEffect", fromTrigger: "Security", count: 1, condition: { kind: "ifThisEffectActed" } },
      ],
    });
    expect(compiled.effects[2]!.frequency).toBeUndefined();

    const placement = [
      {
        kind: "SecurityManipulation",
        op: "placeAsSecurity",
        controller: "mine",
        source: { count: 1, filter: { controller: "mine", kind: ["Digimon"], zone: "battleArea" } },
        ownerSecurity: true,
        toTop: true,
        optional: true,
        abortOnDecline: true,
      },
      {
        kind: "SecurityManipulation",
        op: "placeAsSecurity",
        controller: "opponent",
        source: { count: 1, filter: { controller: "opponent", kind: ["Digimon"], zone: "battleArea" } },
        ownerSecurity: true,
        toTop: true,
      },
    ];
    for (const index of [3, 4, 5]) {
      expect(compiled.effects[index]).toMatchObject({
        frequency: "OncePerTurn",
        sharedUseKey: "EX13-036/place-one-each-as-security",
        actions: placement,
      });
      expect(compiled.effects[index]!.actions.map((action) => "condition" in action)).toEqual([false, false]);
    }
    expect(new Set(compiled.effects.slice(3).map((effect) => effect.sharedUseKey)).size).toBe(1);

    expect(compiled.digivolutionRequirement).toEqual([
      { level: 5, traits: ["Holy Beast", "DATA SQUAD"], cost: 3, isAlternate: true },
    ]);
    expect(digivolutionRequirementsFor(cardId)).toEqual(compiled.digivolutionRequirement);
    expect(compiled.assemblyRequirement).toEqual([
      {
        reduceCost: 5,
        materials: [
          { level: 5, colors: ["Yellow"], traits: ["Holy Beast"], count: 1 },
          { level: 4, colors: ["Yellow"], traits: ["Holy Beast"], count: 1 },
          { level: 3, colors: ["Yellow"], traits: ["Holy Beast"], count: 1 },
        ],
      },
    ]);
    expect(assemblyRequirementFor(cardId)).toEqual(compiled.assemblyRequirement);
  });

  it("Q7318: uses the replacement single-target branch while both stacks total 7 or more", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013"],
        },
        1: {
          battleArea: [
            { card: BIG_BODY, as: "chosen" },
            { card: OTHER_BIG_BODY, as: "bystander" },
          ],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("chosen").topCard.instanceId);
    s.state.memory = 10;
    await s.ready();

    expect(s.state.players[0]!.security.length + s.state.players[1]!.security.length).toBe(7);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kentaurosmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === cardId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("chosen").currentDP).toBe(3000);
    expect(s.perm("bystander").currentDP).toBe(10_000);
    expect(s.state.memory).toBe(-2);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("Q7318: uses the replacement all-target branch while both stacks total 6 or fewer", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013"],
        },
        1: {
          battleArea: [
            { card: BIG_BODY, as: "first" },
            { card: OTHER_BIG_BODY, as: "second" },
          ],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.state.players[0]!.security.length + s.state.players[1]!.security.length).toBe(6);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kentaurosmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === cardId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("first").currentDP).toBe(3000);
    expect(s.perm("second").currentDP).toBe(3000);
    expect(JSON.parse(s.state.players[1]!.fieldEffectsJson)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "dp",
          sourceCardId: cardId,
          effectText: "All of your opponent's Digimon get -7000 DP.",
        }),
      ]),
    );
    // CR 15-11-2-2: a Digimon that enters afterwards is affected too.
    const lateEntrant = s.putOnBoard(1, "BT10-086");
    await advance(s.engine).recompute();
    expect(lateEntrant.currentDP - lateEntrant.baseDP).toBe(s.perm("first").currentDP - s.perm("first").baseDP);
    assertNoLoudGap(s);
  });

  it("reduces an opposing Digimon played later that turn in the all-target branch (Discord 1555352172206493706)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "kentaurosmon" }],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013"],
        },
        1: {
          battleArea: [{ card: BIG_BODY, as: "present" }],
          hand: [{ card: OTHER_BIG_BODY, as: "late" }],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kentaurosmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === cardId));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("present").currentDP).toBe(3000);

    await advance(s.engine).verb.playInstances([s.inst("late").instanceId]);

    expect(s.perm("late").currentDP).toBe(3000);
  });

  it("does not reduce an opposing Digimon played later in the single-target branch (Discord 1555352172206493706)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "kentaurosmon" }],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013"],
        },
        1: {
          battleArea: [{ card: BIG_BODY, as: "chosen" }],
          hand: [{ card: OTHER_BIG_BODY, as: "late" }],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("chosen").topCard.instanceId);
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kentaurosmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === cardId));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("chosen").currentDP).toBe(3000);

    await advance(s.engine).verb.playInstances([s.inst("late").instanceId]);

    expect(s.perm("late").currentDP).toBe(10_000);
  });

  it("expires the -7000 at the end of the turn it was applied", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "kentaurosmon" }],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: BIG_BODY, as: "body" }],
          hand: [{ card: "BT1-011", as: "spareOpponent" }],
          deck: DECK,
          security: ["BT1-011", "BT1-012"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("kentaurosmon"));
    expect(s.perm("body").currentDP).toBe(3000);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    expect(s.perm("body").currentDP).toBe(10_000);
  });

  it("Q7323: activates the printed [Security] body from a real security check, then still battles", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: BIG_BODY, as: "attacker" },
            { card: OTHER_BIG_BODY, as: "bystander" },
          ],
          deck: DECK,
        },
        1: {
          security: [{ card: cardId, as: "kentaurosmon" }],
          deck: DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "securityChecked"), 5000);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("bystander").currentDP).toBe(3000);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([OTHER_BIG_BODY]);
    expect(s.events.find(({ kind }) => kind === "securityChecked")).toMatchObject({ resolution: "battle" });
  });

  it("Q7319: lets the activating player choose either tied-largest security stack", async () => {
    const preferred = ["opponent"];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YELLOW_HOLY_BEAST_LV5, as: "base" }],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013", "BT1-014"],
        },
        1: {
          battleArea: [
            { card: BIG_BODY, as: "chosen" },
            { card: OTHER_BIG_BODY, as: "bystander" },
          ],
          deck: DECK,
          security: [{ card: "BT1-011", as: "theirTop" }, "BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("chosen").topCard.instanceId);
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === cardId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("theirTop").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(4);
    expect(s.perm("chosen").currentDP).toBe(3000);
    expect(s.perm("bystander").currentDP).toBe(10_000);
    assertNoLoudGap(s);
  });

  it("re-reads the total AFTER the cost, so trashing the 7th card opens the all-Digimon branch", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YELLOW_HOLY_BEAST_LV5, as: "base" }],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
          security: [{ card: "BT1-011", as: "myTop" }, "BT1-012", "BT1-013", "BT1-014"],
        },
        1: {
          battleArea: [
            { card: BIG_BODY, as: "first" },
            { card: OTHER_BIG_BODY, as: "second" },
          ],
          deck: DECK,
          security: ["BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.state.players[0]!.security.length + s.state.players[1]!.security.length).toBe(7);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === cardId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("myTop").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.perm("first").currentDP).toBe(3000);
    expect(s.perm("second").currentDP).toBe(3000);
    assertNoLoudGap(s);
  });

  it("skips the borrowed [Security] body when no player has a security card to trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YELLOW_HOLY_BEAST_LV5, as: "base" }],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: BIG_BODY, as: "body" }],
          deck: DECK,
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === cardId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("body").currentDP).toBe(10_000);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[1]!.trash).toHaveLength(0);
  });

  it("Q7321: lets the player order both simultaneous When Digivolving effects", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YELLOW_HOLY_BEAST_LV5, as: "base" }],
          hand: [{ card: cardId, as: "kentaurosmon" }],
          security: ["BT1-011"],
          deck: DECK,
        },
        1: { battleArea: [{ card: BIG_BODY, as: "body" }], security: ["BT1-012"], deck: DECK },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const order = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect(order.options?.triggerCardIds).toEqual([cardId, cardId]);
    expect(order.options?.triggerKeys).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: { kind: "orderTriggers", order: [order.options!.triggerKeys!.at(-1)!] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
  });

  it("places one Digimon of EACH player on top of its own owner's security stack when digivolving", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: YELLOW_HOLY_BEAST_LV5, as: "base" },
            { card: BIG_BODY, as: "mine" },
          ],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OTHER_BIG_BODY, as: "theirs" }],
          deck: DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("mine").topCard.instanceId, s.perm("theirs").topCard.instanceId);
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ cardId: id }) => id)).toEqual([BIG_BODY]);
    expect(s.state.players[1]!.security.map(({ cardId: id }) => id)).toEqual([OTHER_BIG_BODY]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([cardId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("places nothing at all when the single printed You-may is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: YELLOW_HOLY_BEAST_LV5, as: "base" },
            { card: BIG_BODY, as: "mine" },
          ],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OTHER_BIG_BODY, as: "theirs" }],
          deck: DECK,
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === cardId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([OTHER_BIG_BODY]);
  });

  it("shares one [Once Per Turn] across the digivolve and end-of-attack windows, resetting next own turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "kentaurosmon" },
            { card: BIG_BODY, as: "mineFirst" },
            { card: "BT1-013", as: "mineSecond" },
          ],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: OTHER_BIG_BODY, as: "theirFirst" },
            { card: "BT1-014", as: "theirSecond" },
          ],
          hand: [{ card: "BT1-011", as: "spareOpponent" }],
          deck: DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.perm("mineFirst").topCard.instanceId,
      s.perm("mineSecond").topCard.instanceId,
      s.perm("theirFirst").topCard.instanceId,
      s.perm("theirSecond").topCard.instanceId,
    );
    await s.ready();
    const useKey = `${cardId}/${cardId}/place-one-each-as-security`;
    const uses = () => advance(s.engine).ledgers.tracker.count(s.perm("kentaurosmon").topCard.instanceId, useKey);

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("kentaurosmon"));
    expect(uses()).toBe(1);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(1);

    await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("kentaurosmon"));
    expect(uses()).toBe(1);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(1);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);

    s.state.turnSeat = 0;
    s.state.memory = 3;
    await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("kentaurosmon"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(uses()).toBe(1);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("Q7320: closes the counter window after activating this card's single Counter", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "kentaurosmon" },
            { card: BIG_BODY, as: "mine" },
          ],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OTHER_BIG_BODY, as: "attacker" }],
          hand: [{ card: "BT1-011", as: "spareOpponent" }],
          deck: DECK,
          security: ["BT1-012"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("mine").topCard.instanceId);
    await s.ready();
    s.state.turnSeat = 1;
    const attackerId = s.perm("attacker").permanentId;

    expect(
      s.engine.applyIntent(1, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "counterWindowOpened"));

    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const eligible = opened.eligibleCounters.find(
      (entry) => entry.instanceId === s.perm("kentaurosmon").topCard.instanceId,
    );
    expect(eligible).toBeDefined();

    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ cardId: id }) => id)).toEqual([BIG_BODY]);
    expect(s.state.players[1]!.security[0]!.cardId).toBe(OTHER_BIG_BODY);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("Discord 1554296143054118933: placing itself at [Counter] still places the attacker, ending the attack", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "kentaurosmon" }], deck: DECK },
        1: {
          battleArea: [{ card: OTHER_BIG_BODY, as: "attacker" }],
          security: ["BT1-012"],
          deck: DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const eligible = opened.eligibleCounters.find(
      ({ instanceId }) => instanceId === s.perm("kentaurosmon").topCard.instanceId,
    )!;

    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: eligible.instanceId,
        effectKey: eligible.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ cardId: id }) => id)).toEqual([cardId]);
    expect(s.state.players[1]!.security.map(({ cardId: id }) => id)).toEqual([OTHER_BIG_BODY, "BT1-012"]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.events.some(({ kind }) => kind === "securityChecked")).toBe(false);
  });

  it.each([
    ["When Digivolving", EffectTiming.WhenDigivolving],
    ["End of Attack", EffectTiming.OnEndAttack],
  ])("places the opposing Digimon after choosing itself at %s", async (_label, timing) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "kentaurosmon" },
            { card: BIG_BODY, as: "mine" },
          ],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: OTHER_BIG_BODY, as: "theirFirst" },
            { card: "BT1-014", as: "theirSecond" },
          ],
          deck: DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("kentaurosmon").topCard.instanceId, s.perm("theirSecond").topCard.instanceId);
    await s.ready();

    await advance(s.engine).fire(timing, s.perm("kentaurosmon"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ cardId: id }) => id)).toEqual([cardId]);
    expect(s.state.players[1]!.security.map(({ cardId: id }) => id)).toEqual(["BT1-014"]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([BIG_BODY]);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([OTHER_BIG_BODY]);
  });

  it("Q7324: places only itself when it is the only Digimon in the battle area", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YELLOW_HOLY_BEAST_LV5, as: "base" }],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
        },
        1: { deck: DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ cardId: id }) => id)).toEqual([cardId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("digivolves from the printed Yellow Lv.5 EvoCost for 3 with the bonus draw", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YELLOW_HOLY_BEAST_LV5, as: "base" }],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: [{ card: "BT1-011", as: "evolutionDraw" }, "BT1-012", "BT1-013"],
        },
        1: { deck: DECK },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kentaurosmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === cardId);

    expect(s.perm("base").stack.map(({ cardId: id }) => id)).toEqual([YELLOW_HOLY_BEAST_LV5]);
    expect(s.perm("base").currentDP).toBe(12_000);
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("evolutionDraw").instanceId);
    assertNoLoudGap(s);
  });

  it("reaches the alternate route from off-colour Lv.5 sources on either printed trait", async () => {
    for (const base of [PURPLE_HOLY_BEAST_LV5, DATA_SQUAD_LV5]) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: base, as: "base" }],
            hand: [
              { card: cardId, as: "kentaurosmon" },
              { card: "BT1-010", as: "spare" },
            ],
            deck: DECK,
          },
          1: { deck: DECK },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.memory = 5;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("kentaurosmon").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard?.cardId === cardId);

      expect(s.perm("base").stack.map(({ cardId: id }) => id)).toEqual([base]);
      expect(s.state.memory).toBe(2);
    }
  });

  it("refuses a Lv.5 source whose trait only CONTAINS Beast, and one with neither trait", async () => {
    for (const base of [NEAR_TRAIT_LV5, NO_TRAIT_LV5]) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: base, as: "base" }],
            hand: [
              { card: cardId, as: "kentaurosmon" },
              { card: "BT1-010", as: "spare" },
            ],
            deck: DECK,
          },
          1: { deck: DECK },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.memory = 5;
      await s.ready();

      for (const useAlternateCost of [true, false]) {
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("base").permanentId,
            instanceId: s.inst("kentaurosmon").instanceId,
            ...(useAlternateCost ? { useAlternateCost: true } : {}),
          }).ok,
        ).toBe(false);
      }
      expect(s.perm("base").topCard?.cardId).toBe(base);
      expect(s.state.memory).toBe(5);
    }
  });

  it("refuses a Lv.4 Yellow [Holy Beast] source: the route is level-pinned", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YELLOW_HOLY_BEAST_LV4, as: "base" }],
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: DECK,
        },
        1: { deck: DECK },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    for (const useAlternateCost of [true, false]) {
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("kentaurosmon").instanceId,
          ...(useAlternateCost ? { useAlternateCost: true } : {}),
        }).ok,
      ).toBe(false);
    }
    expect(s.perm("base").topCard?.cardId).toBe(YELLOW_HOLY_BEAST_LV4);
    expect(s.state.memory).toBe(5);
  });

  it("Q7322: plays by Assembly -5 with three separately qualifying Yellow Holy Beasts", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: cardId, as: "kentaurosmon" },
            { card: "BT1-010", as: "spare" },
          ],
          trash: [
            { card: YELLOW_HOLY_BEAST_LV5, as: "lv5" },
            { card: YELLOW_HOLY_BEAST_LV4, as: "lv4" },
            { card: YELLOW_HOLY_BEAST_LV3, as: "lv3" },
          ],
          deck: DECK,
          security: ["BT1-011", "BT1-012", "BT1-013"],
        },
        1: { deck: DECK, security: ["BT1-011", "BT1-012", "BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 8;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("kentaurosmon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("lv5").instanceId, s.inst("lv4").instanceId, s.inst("lv3").instanceId],
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === cardId));
    await settle(() => s.state.pendingDecision === undefined);

    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === cardId)!;
    expect(played.stack.map(({ cardId: id }) => id)).toEqual([
      YELLOW_HOLY_BEAST_LV3,
      YELLOW_HOLY_BEAST_LV4,
      YELLOW_HOLY_BEAST_LV5,
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(1);
    assertNoLoudGap(s);
  });

  it("rejects an Assembly whose material levels do not fill Lv.5 × Lv.4 × Lv.3", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "kentaurosmon" }],
          trash: [
            { card: YELLOW_HOLY_BEAST_LV3, as: "lv3a" },
            { card: "EX13-026", as: "lv3b" },
            { card: YELLOW_HOLY_BEAST_LV4, as: "lv4" },
          ],
          deck: DECK,
        },
        1: { deck: DECK, security: ["BT1-011"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 8;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("kentaurosmon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("lv3a").instanceId, s.inst("lv3b").instanceId, s.inst("lv4").instanceId],
        },
      } as never).ok,
    ).toBe(false);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(3);
    expect(s.state.memory).toBe(8);
  });

  it("rejects an Assembly material without the exact [Holy Beast] trait, and one of the wrong colour", async () => {
    for (const wrongLv3 of [YELLOW_PLAIN_LV3, GREEN_HOLY_BEAST_LV3]) {
      const s = setupEngine(
        {
          0: {
            hand: [{ card: cardId, as: "kentaurosmon" }],
            trash: [
              { card: YELLOW_HOLY_BEAST_LV5, as: "lv5" },
              { card: YELLOW_HOLY_BEAST_LV4, as: "lv4" },
              { card: wrongLv3, as: "lv3" },
            ],
            deck: DECK,
          },
          1: { deck: DECK, security: ["BT1-011"] },
        },
        { autoSelectCards: true },
      );
      s.state.memory = 8;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "playCard",
          instanceId: s.inst("kentaurosmon").instanceId,
          assembly: {
            materialInstanceIds: [s.inst("lv5").instanceId, s.inst("lv4").instanceId, s.inst("lv3").instanceId],
          },
        } as never).ok,
      ).toBe(false);
      expect(s.state.players[0]!.battleArea).toHaveLength(0);
      expect(s.state.players[0]!.trash).toHaveLength(3);
      expect(s.state.memory).toBe(8);
    }
  });
});

describe("GitHub #4932 — Kentaurosmon reactivated security", () => {
  it("reduces both opposing Digimon after paying the security cost on digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST24-10", as: "base" }],
          hand: [{ card: "EX13-036", as: "kent" }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-024", as: "first" },
            { card: "BT1-024", as: "second" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("kent").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.events.some(
        (e) => e.kind === "effectResolved" && e.sourceCardId === "EX13-036" && e.effectKey?.includes("reactivated"),
      ),
    );
    expect(s.perm("first").currentDP).toBe(3000);
    expect(s.perm("second").currentDP).toBe(3000);
  });
});
