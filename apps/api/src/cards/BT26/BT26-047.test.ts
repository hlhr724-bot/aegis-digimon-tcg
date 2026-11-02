import { describe, expect, it } from "vitest";
import { assemblyRequirementFor, digivolutionRequirementsFor, EffectDuration, EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT26-047.js";
import "../index.js";

describe("BT26-047 TyrantKabuterimon", () => {
  it("encodes immediate optional battle and the suspend-paid Option immunity/DP effect in every printed window", () => {
    expect(digivolutionRequirementsFor("BT26-047")).toContainEqual({
      level: 5,
      traits: ["Insectoid", "TS"],
      cost: 3,
      isAlternate: true,
    });
    expect(assemblyRequirementFor("BT26-047")).toEqual([
      {
        reduceCost: 6,
        materials: [{ kinds: ["Digimon"], traits: ["Larva", "Insectoid", "Titan"], count: 4, differentLevels: true }],
      },
    ]);
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      const effects = compiled.effects?.filter((effect) => effect.trigger === trigger) ?? [];
      expect(effects).toHaveLength(2);
      expect(effects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actions: [{ kind: "Battle", optional: true, attacker: expect.any(Object), defender: expect.any(Object) }],
          }),
          expect.objectContaining({
            actions: [
              expect.objectContaining({
                kind: "CostGatedBlock",
                cost: { kind: "suspend", target: expect.any(Object) },
                actions: [
                  expect.objectContaining({ kind: "Restrict", restriction: "beAffected", fromSourceKind: ["Option"] }),
                  expect.objectContaining({ kind: "ModifyDP", amount: 3000 }),
                ],
              }),
            ],
          }),
        ]),
      );
    }
    expect(compiled.effects?.find((effect) => effect.trigger === "StartOfYourMainPhase")).toMatchObject({
      actions: [{ kind: "CostGatedBlock", cost: { kind: "suspend" } }],
    });
  });

  it("uses the Lv.5 TS alternate evolution path for cost 3", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT25-083", as: "purpleTsBase" }],
        hand: [{ card: "BT26-047", as: "tyrant" }],
        deck: ["BT1-009"],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("purpleTsBase").permanentId,
        instanceId: s.inst("tyrant").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("purpleTsBase").topCard.cardId === "BT26-047");

    expect(s.state.memory).toBe(0);
    expect(s.perm("purpleTsBase").stack.map((card) => card.cardId)).toEqual(["BT25-083"]);
  });

  it("plays by Assembly with four matching cards at four different levels", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-047", as: "tyrant" }],
        trash: [
          { card: "ST4-05", as: "level3" },
          { card: "ST4-07", as: "level4" },
          { card: "ST4-09", as: "level5" },
          { card: "ST4-13", as: "level6" },
        ],
      },
    });
    s.state.memory = 7;
    const materials = ["level3", "level4", "level5", "level6"].map((alias) => s.inst(alias).instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("tyrant").instanceId,
        assembly: { materialInstanceIds: materials },
      } as never),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT26-047")?.stack.length ===
        4,
    );

    const tyrant = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT26-047")!;
    expect(s.state.memory).toBe(0);
    expect(tyrant.stack.map((card) => card.instanceId)).toEqual([...materials].reverse());
    expect(tyrant.stack.every((card) => card.faceUp)).toBe(true);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("#5167 rejects a trait-matching Digi-Egg among four distinct Assembly levels", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-047", as: "tyrant" }],
        trash: [
          { card: "BT16-004", as: "egg" },
          { card: "ST4-05", as: "level3" },
          { card: "ST4-07", as: "level4" },
          { card: "ST4-09", as: "level5" },
        ],
      },
    });
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("tyrant").instanceId,
        assembly: {
          materialInstanceIds: ["egg", "level3", "level4", "level5"].map((alias) => s.inst(alias).instanceId),
        },
      }),
    ).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.state.players[0]!.trash).toHaveLength(4);
    expect(s.state.memory).toBe(10);
  });

  it("rejects Assembly when matching materials repeat a level", () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-047", as: "tyrant" }],
        trash: [
          { card: "ST4-05", as: "level3a" },
          { card: "BT1-066", as: "level3b" },
          { card: "ST4-07", as: "level4" },
          { card: "ST4-09", as: "level5" },
        ],
      },
    });
    s.state.memory = 7;
    const materials = ["level3a", "level3b", "level4", "level5"].map((alias) => s.inst(alias).instanceId);

    const result = s.engine.applyIntent(0, {
      type: "playCard",
      instanceId: s.inst("tyrant").instanceId,
      assembly: { materialInstanceIds: materials },
    } as never);

    expect(result.ok).toBe(false);
    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(materials);
  });

  it("may decline both optional On Play effects without changing the board", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT26-047", as: "tyrant" }],
          battleArea: [{ card: "BT26-045", as: "eligible", suspended: true }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 13;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tyrant").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tyrant").topCard?.cardId === "BT26-047");

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("eligible").currentDP).toBe(11000);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("eligible"), "beAffected", "Option")).toBe(false);
  });

  it("publicly plays, buffs only suspended Insectoid or Titan Digimon, and protects them from opposing Options", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT26-047", as: "tyrant" }],
          battleArea: [
            { card: "BT26-045", as: "eligible", suspended: true },
            { card: "BT1-065", as: "nonMatching", suspended: true },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 13;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tyrant").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tyrant").topCard.cardId === "BT26-047" && s.perm("eligible").currentDP === 14000);

    expect(s.perm("eligible").currentDP).toBe(14000);
    expect(s.perm("nonMatching").currentDP).toBe(4000);
    expect(JSON.parse(s.state.players[0]!.fieldEffectsJson)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "restriction",
          value: "beAffected",
          sourceCardId: "BT26-047",
          fromSourceKind: ["Option"],
          byOpponentEffectsOnly: true,
          effectText:
            "Your opponent's Option card effects don't affect any of your suspended Digimon with the [Insectoid] or [Titan] trait.",
        }),
        expect.objectContaining({
          kind: "dp",
          sourceCardId: "BT26-047",
          effectText: "All of your suspended Digimon with the [Insectoid] or [Titan] trait get +3000 DP.",
        }),
      ]),
    );
    const continuous = (
      s.engine as unknown as { continuous: { hasRestriction: (id: string, kind: string, source?: string) => boolean } }
    ).continuous;
    expect(continuous.hasRestriction(s.perm("eligible").permanentId, "beAffected", "Option")).toBe(true);
  });

  it("CR 15-11-2-3-3: a matching Digimon that suspends after resolution also gets the DP and Option immunity", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT26-047", as: "tyrant" }],
          battleArea: [{ card: "ST4-07", as: "later" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "battleTarget" },
            { card: "BT1-009", as: "costTarget" },
          ],
          security: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("battleTarget").permanentId, s.perm("costTarget").permanentId);
    s.state.memory = 13;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tyrant").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.filter((event) => event.kind === "effectResolved" && event.sourceCardId === "BT26-047").length === 2 &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("later").isSuspended).toBe(false);
    expect(s.perm("later").currentDP).toBe(6000);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("later").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());

    expect(s.perm("later").isSuspended).toBe(true);
    expect(s.perm("later").currentDP).toBe(9000);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("later"), "beAffected", "Option")).toBe(true);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("later"), "beAffected", "Tamer")).toBe(false);
  });

  it("offers the two simultaneous On Play effects for ordering (Q7043)", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT26-047", as: "tyrant" }] },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    s.state.memory = 13;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tyrant").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const pending = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    const keys = request.options?.triggerKeys ?? [];
    expect(keys).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderTriggers", order: [keys[1]!] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
  });

  it("immediately battles and can delete an effect-immune opponent by the battle rules (Q7040-Q7041)", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT26-047", as: "tyrant" }] },
        1: { battleArea: [{ card: "BT1-009", as: "immuneDefender" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 13;
    await s.ready();
    const defender = s.perm("immuneDefender");
    advance(s.engine).ledgers.continuous.addRestriction(defender.permanentId, "beAffected", EffectDuration.Permanent, {
      fromSourceKind: ["Digimon"],
      byOpponentEffectsOnly: true,
    });

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tyrant").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(defender.topCard.instanceId);
  });

  it("may suspend an opponent Digimon as its cost, then buffs all suspended matching Digimon (Q7042, Q7044-Q7045)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-047", as: "tyrant", suspended: true },
            { card: "BT26-045", as: "otherImmune", suspended: true },
          ],
          deck: ["BT1-013", "BT1-014"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "costDigimon" },
            { card: "BT1-087", as: "yellowSource" },
          ],
          hand: [{ card: "BT1-106", as: "option" }],
          deck: ["BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: false, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.perm("costDigimon").topCard.instanceId, s.perm("tyrant").topCard.instanceId);

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const costDecision = s.state.pendingDecision!;
    expect(costDecision.kind).toBe("chooseTargets");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: costDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("costDigimon").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("costDigimon").isSuspended);
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT26-047"));
    expect(s.perm("costDigimon").isSuspended).toBe(true);
    expect(s.perm("tyrant").currentDP).toBe(13000);
    expect(s.perm("otherImmune").currentDP).toBe(11000);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("tyrant"), "beAffected", "Option")).toBe(false);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("stops an already-active opposing Option grant as soon as immunity is gained (Q7047)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-047", as: "tyrant" }], deck: ["BT1-009", "BT1-010", "BT1-011"] },
        1: {
          battleArea: [{ card: "BT1-087", as: "yellowSource" }],
          hand: [{ card: "ST3-15", as: "grantOption" }],
          deck: ["BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const firstPrompt = s.state.pendingDecision!;
    expect(firstPrompt.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: firstPrompt.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("grantOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).keywordAmount(s.perm("tyrant"), "SecurityAttack") === -3);
    expect(observe(s.engine).keywordAmount(s.perm("tyrant"), "SecurityAttack")).toBe(-3);

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    const secondPrompt = s.state.pendingDecision!;
    expect(secondPrompt.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: secondPrompt.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).keywordAmount(s.perm("tyrant"), "SecurityAttack") === 0);
    advance(s.engine).endMainPhaseIfOpen(0);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it.each([
    { outcome: "activates after immunity lapses", renewImmunity: false },
    { outcome: "does not trigger while immunity is renewed", renewImmunity: true },
  ])("retains an opposing Option grant while immune and $outcome (Q7046, Q7048-Q7049)", async ({ renewImmunity }) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-047", as: "tyrant" }], deck: ["BT1-009", "BT1-010", "BT1-011"] },
        1: {
          battleArea: [
            { card: "BT1-087", as: "yellowSource" },
            { card: "BT2-090", as: "purpleSource" },
          ],
          hand: [
            { card: "ST3-15", as: "keywordOption" },
            { card: "EX7-072", as: "triggerOption" },
          ],
          deck: ["BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    const recipientId = s.perm("tyrant").permanentId;

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const firstPrompt = s.state.pendingDecision!;
    expect(firstPrompt.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: firstPrompt.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestrictedByEffect(s.perm("tyrant"), "beAffected", "Option"));
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("triggerOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === "EX7-072"));
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(observe(s.engine).subscriptions("endOfTurn", s.perm("tyrant").permanentId)).toHaveLength(1);
    expect([...s.perm("tyrant").grantedEffectTexts]).toEqual(["[End of Your Turn] Delete 1 of your Digimon."]);

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    const secondPrompt = s.state.pendingDecision!;
    expect(secondPrompt.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: secondPrompt.decisionId,
        response: { kind: "optional", accept: renewImmunity },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => observe(s.engine).isRestrictedByEffect(s.perm("tyrant"), "beAffected", "Option") === renewImmunity,
    );
    expect(observe(s.engine).subscriptions("endOfTurn", s.perm("tyrant").permanentId)).toHaveLength(1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.battleArea).toHaveLength(renewImmunity ? 1 : 0);
    expect(observe(s.engine).subscriptions("endOfTurn", recipientId)).toHaveLength(0);
    expect([...s.state.players[0]!.battleArea].flatMap((permanent) => [...permanent.grantedEffectTexts])).toEqual([]);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("buffs and protects Insectoid or Titan Digimon that become suspended later in the turn (Discord 1555352172206493706)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-047", as: "tyrant" },
            { card: "BT26-045", as: "eligible" },
            { card: "BT1-065", as: "nonMatching" },
            { card: "BT1-065", as: "payer" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("payer").permanentId);
    await s.ready();
    const optionImmune = (alias: string) =>
      observe(s.engine).isRestrictedByEffect(s.perm(alias), "beAffected", "Option");
    const digimonImmune = (alias: string) =>
      observe(s.engine).isRestrictedByEffect(s.perm(alias), "beAffected", "Digimon");

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("tyrant"));
    expect(s.perm("payer").isSuspended).toBe(true);
    expect(s.perm("eligible").currentDP).toBe(11000);
    expect(optionImmune("eligible")).toBe(false);

    await advance(s.engine).verb.suspend([s.perm("eligible").permanentId, s.perm("nonMatching").permanentId]);
    expect(s.perm("eligible").currentDP).toBe(14000);
    expect(optionImmune("eligible")).toBe(true);
    expect(digimonImmune("eligible")).toBe(false);
    expect(s.perm("nonMatching").currentDP).toBe(4000);
    expect(optionImmune("nonMatching")).toBe(false);

    await advance(s.engine).verb.unsuspend([s.perm("eligible").permanentId]);
    expect(s.perm("eligible").currentDP).toBe(11000);
    expect(optionImmune("eligible")).toBe(false);
  });
});
