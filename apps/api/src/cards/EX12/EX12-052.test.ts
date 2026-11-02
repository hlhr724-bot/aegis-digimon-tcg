import { describe, expect, it } from "vitest";
import {
  compiledEffects,
  EffectDuration,
  EffectTiming,
  digivolutionRequirementsFor,
  getCardDefinition,
  Zone,
} from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX12-052.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { expectOnlyOneCounterPerAttack } from "./counterOnce.testSupport.js";
import "../index.js";

describe("EX12-052 Diarbbitmon", () => {
  it("maps evolution, keywords, Use Req., immunity, shared OPT, direct battle, and Option Main", () => {
    expect(digivolutionRequirementsFor("EX12-052")).toEqual([
      { level: 5, texts: ["Angoramon"], cost: 3, isAlternate: true },
      { level: 5, traits: ["NSp"], cost: 3, isAlternate: true },
    ]);
    expect(compiled.effects.filter((effect) => effect.trigger === "Static")).toEqual([
      { trigger: "Static", actions: [], keywords: [{ keyword: "Piercing", raw: "＜Piercing＞" }] },
      { trigger: "Static", actions: [], keywords: [{ keyword: "Vortex", raw: "＜Vortex＞" }] },
      {
        trigger: "Static",
        actions: [
          {
            kind: "WaiveColorRequirement",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            condition: {
              kind: "youHave",
              filter: {
                zone: ["battleArea", "breeding"],
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["NSp"], match: "trait" }],
              },
              raw: "you have an [NSp] trait card in play",
            },
          },
        ],
      },
    ]);

    const digivolving = compiled.effects.filter((effect) => effect.trigger === "WhenDigivolving");
    expect(digivolving).toHaveLength(2);
    expect(digivolving[0]).toMatchObject({
      actions: [
        {
          kind: "Restrict",
          restriction: "beAffected",
          fromSourceKind: ["Digimon"],
          byOpponentEffectsOnly: true,
          duration: "untilOpponentTurnEnd",
        },
      ],
    });
    expect(digivolving[1]).toMatchObject({
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
      actions: [
        { kind: "ModifyDP", amount: 3000, duration: "untilOpponentTurnEnd" },
        {
          kind: "Battle",
          attacker: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, fromSelectionRef: "buffedDigimon" },
          defender: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        },
      ],
    });
    for (const trigger of ["WhenAttacking", "Counter"] as const) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        frequency: "OncePerTurn",
        sharedUseKey: "ir-shared-0",
        actions: [{ kind: "ModifyDP" }, { kind: "Battle" }],
      });
    }
    for (const trigger of ["WhenDigivolving", "WhenAttacking", "Counter"] as const) {
      const shared = compiled.effects.filter((effect) => effect.trigger === trigger).at(-1)!;
      expect(shared.optional).toBe(true);
      for (const action of shared.actions) expect(action).not.toHaveProperty("optional");
    }
    expect(compiled.effects.find((effect) => effect.trigger === "Main")).toMatchObject({
      actions: [
        { kind: "Unsuspend", optional: true },
        { kind: "Suspend", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 2 } },
        {
          kind: "Restrict",
          restriction: "unsuspend",
          duration: "untilOpponentTurnEnd",
          target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 2 },
        },
      ],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(registeredCompiledCards.get("EX12-052")).toEqual(compiled);
    expect(compiledEffects["EX12-052"]).toEqual(compiled);
  });

  it("Q6836-Q6844 scopes immunity to opposing Digimon effects and forces battle after accepting the buff", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-052", as: "source", dp: 12000 }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent", dp: 3000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    await settle(() => observe(s.engine).hasRestriction(s.perm("source"), "beAffected", "Digimon"));

    expect(s.perm("source").currentDP).toBe(15000);
    expect(observe(s.engine).hasRestriction(s.perm("source"), "beAffected", "Digimon")).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);

    const sourceId = s.perm("source").permanentId;
    advance(s.engine).verb.enterEffectResolution(0, ["Digimon"]);
    await advance(s.engine).verb.modifyDP(sourceId, 1000, EffectDuration.UntilOpponentTurnEnd);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.perm("source").currentDP).toBe(16000);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    await advance(s.engine).verb.modifyDP(sourceId, -1000, EffectDuration.UntilOpponentTurnEnd);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.perm("source").currentDP).toBe(16000);

    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.modifyDP(sourceId, -1000, EffectDuration.UntilOpponentTurnEnd);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.perm("source").currentDP).toBe(15000);
  });

  it("shares the once-per-turn budget across When Digivolving and When Attacking", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-052", as: "source", dp: 12000 }] },
        1: { battleArea: [{ card: "BT1-009", as: "opponent", dp: 3000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.perm("source").currentDP).toBe(15000);

    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("source"));
    expect(s.perm("source").currentDP).toBe(15000);
  });

  it.each([
    ["When Attacking", EffectTiming.OnUseAttack],
    ["Counter", EffectTiming.OnCounterTiming],
  ])("executes the shared battle clause from %s", async (_label, timing) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-052", as: "source", dp: 12000 }] },
        1: { battleArea: [{ card: "BT1-009", as: "opponent", dp: 3000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(timing, s.perm("source"));
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.perm("source").currentDP).toBe(15000);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("resolves the accepted shared effect from a public attack intent", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-052", as: "source", dp: 12000 }] },
        1: { battleArea: [{ card: "BT1-009", as: "opponent", dp: 3000 }], security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && !observe(s.engine).isAttacking());

    expect(s.perm("source").currentDP).toBe(15000);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX12-052")).toBe(true);
  });

  it("opens and resolves its Counter effect through the public counter window", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 3000 }] },
        1: {
          battleArea: [
            { card: "EX12-052", as: "counterCard", dp: 12000 },
            { card: "BT1-010", as: "defender", dp: 5000 },
          ],
          security: ["BT1-011"],
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
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));

    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const eligible = opened.eligibleCounters.find(
      (entry) => entry.instanceId === s.perm("counterCard").topCard!.instanceId,
    );
    expect(eligible).toBeDefined();
    expect(
      s.engine.applyIntent(1, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0 && !observe(s.engine).isAttacking());

    expect(s.perm("counterCard").currentDP).toBe(15000);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.perm("defender").currentDP).toBe(5000);
  });

  it("resolves the Option Main face independently: unsuspends, suspends two, and locks two", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-050", as: "nsp" },
            { card: "BT1-009", as: "own", suspended: true },
          ],
          hand: [{ card: "EX12-052", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "oppOne" },
            { card: "BT1-010", as: "oppTwo" },
            { card: "BT1-011", as: "oppThree" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("oppOne").isSuspended && s.perm("oppTwo").isSuspended);
    await settle(() => false, 60);

    expect(s.perm("own").isSuspended).toBe(false);
    const locked = ["oppOne", "oppTwo", "oppThree"].filter((alias) =>
      observe(s.engine).isRestricted(s.perm(alias), "unsuspend"),
    );
    expect(locked).toHaveLength(2);
  });

  it("digivolves through both colors and both alternates, rejecting a nonmatch", async () => {
    for (const [baseCardId, useAlternateCost, expectedCost] of [
      ["BT1-075", false, 4],
      ["BT10-064", false, 4],
      ["BT13-055", true, 3],
      ["EX12-051", true, 3],
    ] as const) {
      const s = setupEngine({
        0: { battleArea: [{ card: baseCardId, as: "base" }], hand: [{ card: "EX12-052", as: "target" }] },
      });
      s.state.memory = 4;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("target").instanceId,
          useAlternateCost,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "EX12-052");
      expect(s.state.memory).toBe(4 - expectedCost);
    }

    const invalid = setupEngine({
      0: { battleArea: [{ card: "BT1-020", as: "base" }], hand: [{ card: "EX12-052", as: "target" }] },
    });
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("base").permanentId,
        instanceId: invalid.inst("target").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("maps the complete dual-card catalog identity and publishes both keywords", async () => {
    expect(getCardDefinition("EX12-052")).toMatchObject({
      nameEn: "Diarbbitmon",
      colors: ["Green", "Black"],
      kinds: ["Digimon", "Option"],
      playCost: 5,
      dp: 12000,
      level: 6,
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Beast Knight", "NSp"],
      evoCosts: [
        { color: "Green", level: 5, memoryCost: 4 },
        { color: "Black", level: 5, memoryCost: 4 },
      ],
      isDualCard: true,
      dualEffect: "Truskmore Advance",
      optionColorRequirements: ["Green"],
    });
    const s = setupEngine({ 0: { battleArea: [{ card: "EX12-052", as: "source" }] } });
    await s.ready();
    expect([...s.perm("source").keywords]).toEqual(expect.arrayContaining(["Piercing", "Vortex"]));
  });
});

describe("EX12-052 Diarbbitmon — KB Q&A rulings", () => {
  async function immuneDiarbbitmon() {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-052", as: "diarbbitmon" }] },
        1: { hand: [{ card: "EX12-016", as: "metalGreymon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("diarbbitmon"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(observe(s.engine).hasRestriction(s.perm("diarbbitmon"), "beAffected", "Digimon")).toBe(true);
    return s;
  }

  async function opponentPlays(s: ReturnType<typeof setupEngine>, cardId: string) {
    const card = s.give(1, Zone.Hand, cardId);
    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some(({ topCard }) => topCard.instanceId === card.instanceId));
    await settle(() => s.state.pendingDecision === undefined);
    s.state.turnSeat = 0;
  }

  async function giveStartOfMainAttackWhileImmune() {
    const s = await immuneDiarbbitmon();
    s.state.turnSeat = 1;
    s.state.memory = 7;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("metalGreymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    await settle(() => s.state.pendingDecision === undefined);
    s.state.turnSeat = 0;
    return s;
  }

  function endImmunity(s: ReturnType<typeof setupEngine>) {
    advance(s.engine).ledgers.continuous.sweep(s.state, "opponentTurnEnd", 1);
  }

  it("uses the [Angoramon]-in-text cost for a level 5 card whose text, not name, contains it (Q6835)", async () => {
    for (const [baseCardId, expectedCost] of [
      ["BT13-055", 3],
      ["BT1-075", 4],
    ] as const) {
      const s = setupEngine({
        0: { battleArea: [{ card: baseCardId, as: "base" }], hand: [{ card: "EX12-052", as: "target" }] },
      });
      s.state.memory = 4;
      expect(getCardDefinition(baseCardId)?.nameEn).not.toContain("Angoramon");
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("target").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "EX12-052");
      expect(s.state.memory, baseCardId).toBe(4 - expectedCost);
    }
  });

  it("stops an opposing Digimon's suspend and DP reduction from affecting the protected Digimon (Q6837)", async () => {
    const s = await immuneDiarbbitmon();
    const dpBefore = s.perm("diarbbitmon").currentDP;

    await opponentPlays(s, "BT1-070");
    await opponentPlays(s, "BT1-055");

    expect(s.perm("diarbbitmon").isSuspended).toBe(false);
    expect(s.perm("diarbbitmon").currentDP).toBe(dpBefore);
  });

  it("can still be chosen by an opposing Digimon's suspend effect (Q6838)", async () => {
    const s = await immuneDiarbbitmon();
    const decisionsBefore = s.decisions.length;

    await opponentPlays(s, "BT1-070");

    const offered = s.decisions
      .slice(decisionsBefore)
      .filter(({ seat }) => seat === 1)
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(
      offered.some((id) => id === s.perm("diarbbitmon").permanentId || id === s.perm("diarbbitmon").topCard.instanceId),
    ).toBe(true);
    expect(s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-070")).toBe(true);
    expect(s.perm("diarbbitmon").isSuspended).toBe(false);
  });

  it("can be given an opposing Digimon's effect without being affected by it (Q6839)", async () => {
    const s = await giveStartOfMainAttackWhileImmune();

    expect(
      observe(s.engine).subscriptions("startOfYourMainPhase", s.perm("diarbbitmon").permanentId).length,
    ).toBeGreaterThan(0);
    await advance(s.engine).fireGlobal(EffectTiming.OnStartMainPhase);
    expect(s.perm("diarbbitmon").isSuspended).toBe(false);
  });

  it("stops being affected by an earlier DP reduction as soon as it gains the immunity (Q6840)", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX12-052", as: "diarbbitmon" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await opponentPlays(s, "BT1-055");
    expect(s.perm("diarbbitmon").currentDP).toBe(9000);
    await advance(s.engine).verb.returnToHand(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId));

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("diarbbitmon"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("diarbbitmon").currentDP).toBe(15000);
  });

  it("becomes affected by an effect it was given while immune once the immunity ends (Q6841)", async () => {
    const s = await immuneDiarbbitmon();
    await opponentPlays(s, "BT1-055");
    const immuneDp = s.perm("diarbbitmon").currentDP;

    endImmunity(s);
    await advance(s.engine).recompute();

    expect(observe(s.engine).hasRestriction(s.perm("diarbbitmon"), "beAffected", "Digimon")).toBe(false);
    expect(s.perm("diarbbitmon").currentDP).toBe(immuneDp - 3000);
  });

  it("does not trigger a given [Start of Your Main Phase] effect while immune at that timing (Q6842)", async () => {
    const immune = await giveStartOfMainAttackWhileImmune();
    await advance(immune.engine).fireGlobal(EffectTiming.OnStartMainPhase);
    expect(immune.events.some((event) => event.kind === "attackDeclared")).toBe(false);

    const exposed = await giveStartOfMainAttackWhileImmune();
    endImmunity(exposed);
    await advance(exposed.engine).fireGlobal(EffectTiming.OnStartMainPhase);
    expect(exposed.events.some((event) => event.kind === "attackDeclared")).toBe(true);
  });

  it("battles with the standard rules, deleting both Digimon on a DP tie (Q6843)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-052", as: "diarbbitmon", dp: 5000 }] },
        1: { battleArea: [{ card: "BT1-009", as: "opponent", dp: 8000 }], security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("diarbbitmon"));
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("lets only one [Counter] effect activate during one attack (Q6845)", async () => {
    await expectOnlyOneCounterPerAttack({ card: "EX12-052", dp: 12000 }, { card: "EX12-057" });
  });

  async function piercingAttackWithEffectBattle(protectAttackTarget: boolean) {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-052", as: "diarbbitmon" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "attackTarget", dp: 3000, suspended: true },
            { card: "BT1-010", as: "effectBattle", dp: 3000 },
          ],
          security: ["BT1-101", "BT1-101", "BT1-101"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("effectBattle").permanentId, s.perm("effectBattle").topCard.instanceId);
    await s.ready();
    if (protectAttackTarget) {
      await advance(s.engine).verb.restrict(
        s.perm("attackTarget").permanentId,
        "beDeletedInBattle",
        EffectDuration.Permanent,
      );
    }

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("diarbbitmon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("attackTarget").permanentId },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined, 300);

    expect(s.state.players[1]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-010")).toBe(false);
    return s;
  }

  it("performs only one <Piercing> security check after two battle deletions in one attack (Q6846)", async () => {
    const s = await piercingAttackWithEffectBattle(false);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("still activates <Piercing> when the attack target survives its lost battle (Q6847)", async () => {
    const s = await piercingAttackWithEffectBattle(true);

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-009"]);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("does not activate its own <Piercing> after its [Counter] battle deletes the attacker (Q6848)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 3000 }], security: ["BT1-101", "BT1-101"] },
        1: { battleArea: [{ card: "EX12-052", as: "counterCard" }], security: ["BT1-011"] },
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
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const eligible = opened.eligibleCounters.find(
      ({ instanceId }) => instanceId === s.perm("counterCard").topCard.instanceId,
    );
    expect(
      s.engine.applyIntent(1, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined, 300);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.events.some((event) => event.kind === "securityChecked")).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("suspends different cards from the ones it stops from unsuspending (Q6849)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-050", as: "nsp" }],
          hand: [{ card: "EX12-052", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "oppOne" },
            { card: "BT1-010", as: "oppTwo" },
            { card: "BT26-104", as: "tamer" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("tamer").permanentId, s.perm("tamer").topCard.instanceId);
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestricted(s.perm("tamer"), "unsuspend"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("oppOne").isSuspended && s.perm("oppTwo").isSuspended).toBe(true);
    expect(s.perm("tamer").isSuspended).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("tamer"), "unsuspend")).toBe(true);
    expect(
      ["oppOne", "oppTwo"].filter((alias) => observe(s.engine).isRestricted(s.perm(alias), "unsuspend")),
    ).toHaveLength(1);
  });

  it("holds opponent suspension triggers until Arts Digivolve, then resolves the turn player first (Discord bug 1555168521175048263)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-093", as: "artsBase" }],
          hand: [{ card: "EX12-052", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "EX13-023", as: "ulforce", dp: 30_000 },
            { card: "BT11-112", as: "rina" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("artsBase").topCard.instanceId);
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("artsBase").topCard.cardId === "EX12-052");
    await settle(() => s.state.pendingDecision === undefined && s.perm("rina").isSuspended);

    const digivolved = s.events.findIndex((event) => event.kind === "digivolved" && event.cardId === "EX12-052");
    const ownWhenDigivolving = s.events.flatMap((event, index) =>
      event.kind === "effectTriggered" && event.seat === 0 && event.timing === "WhenDigivolving" ? [index] : [],
    );
    const opponentTriggers = s.events.flatMap((event, index) =>
      event.kind === "effectTriggered" && event.seat === 1 ? [index] : [],
    );
    expect(s.perm("ulforce").isSuspended).toBe(true);
    expect(digivolved).toBeGreaterThan(-1);
    expect(ownWhenDigivolving.length).toBeGreaterThan(0);
    expect(
      s.events.some(
        (event) => event.kind === "effectTriggered" && event.seat === 1 && event.sourceCardId === "BT11-112",
      ),
    ).toBe(true);
    expect(Math.min(...opponentTriggers)).toBeGreaterThan(digivolved);
    expect(Math.min(...opponentTriggers)).toBeGreaterThan(Math.max(...ownWhenDigivolving));
  });

  it("holds opponent suspension triggers until the used Option reaches the trash (Discord bug 1555168521175048263)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-050", as: "nsp" }],
          hand: [{ card: "EX12-052", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "EX13-023", as: "ulforce" },
            { card: "BT11-112", as: "rina" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.perm("rina").isSuspended);

    const trashed = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" &&
        event.optionUsed === true &&
        event.instanceIds.includes(s.inst("option").instanceId),
    );
    const rinaTriggered = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.seat === 1 && event.sourceCardId === "BT11-112",
    );
    expect(trashed).toBeGreaterThan(-1);
    expect(rinaTriggered).toBeGreaterThan(trashed);
  });
});
