import { describe, expect, it } from "vitest";
import { digivolutionRequirementsFor, EffectDuration, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./BT25-058.js";
import { compiled } from "./BT25-058.js";

describe("BT25-058 Callismon", () => {
  it("registers the mandatory de-digivolve followed by the optional battle for both effect events", () => {
    const allTurns = compiled.effects.find((effect) => effect.trigger === "AllTurns")!;
    const watchers = allTurns.actions.filter((action) => action.kind === "SubTrigger");
    expect(watchers.map((action) => action.event)).toEqual(["whenPlayed", "whenAnyDigivolves"]);
    for (const watcher of watchers) {
      expect(watcher.actions[0]).toMatchObject({ kind: "DeDigivolve", amount: 1 });
      expect(watcher.actions[1]).toMatchObject({ kind: "Battle", optional: true });
    }
  });

  it("matches the complete catalog, keywords, TS evolution, and shared Once Per Turn identity", () => {
    expect(getCardDefinition("BT25-058")).toMatchObject({
      cardId: "BT25-058",
      set: "BT25",
      nameEn: "Callismon",
      colors: ["Green", "Black"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 13,
      dp: 13000,
      evoCosts: [
        { color: "Green", level: 5, memoryCost: 5 },
        { color: "Black", level: 5, memoryCost: 5 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Dark Animal", "Iliad", "TS"],
      rarity: "R",
      maxCountInDeck: 4,
      dualEffect: "Callismon",
    });
    const definition = getCardDefinition("BT25-058")!;
    expect(definition.effectText?.replace(/\u00a0/g, " ")).toContain("＜Reboot＞");
    expect(definition.effectText?.replace(/\u00a0/g, " ")).toContain("＜Blocker＞");
    expect(definition.effectText?.replace(/\u00a0/g, " ")).toContain("＜Fortitude＞");
    expect(definition.effectText?.replace(/\u00a0/g, " ")).toContain("[On Play] [When Digivolving] [When Attacking]");
    expect(definition.effectText?.replace(/\u00a0/g, " ")).toContain(
      "[All Turns] [Once Per Turn] When effects play or digivolve any Digimon",
    );
    expect(digivolutionRequirementsFor("BT25-058")).toContainEqual({
      level: 5,
      traits: ["TS"],
      cost: 4,
      isAlternate: true,
    });

    const triggered = compiled.effects.filter((effect) =>
      ["OnPlay", "WhenDigivolving", "WhenAttacking"].includes(effect.trigger),
    );
    expect(triggered).toHaveLength(3);
    expect(triggered.every((effect) => effect.frequency === "OncePerTurn")).toBe(true);
    expect(triggered.map((effect) => effect.sharedUseKey)).toEqual(["ir-shared-0", "ir-shared-0", "ir-shared-0"]);
    for (const effect of triggered) {
      expect(effect.actions[0]).toMatchObject({
        kind: "Suspend",
        target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
        optional: true,
      });
      expect(effect.actions[1]).toMatchObject({
        kind: "Restrict",
        target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
        restriction: "unsuspend",
        duration: "untilOpponentTurnEnd",
      });
      expect(effect.actions[1]).not.toHaveProperty("condition");
    }
    expect(
      compiled.effects.find((effect) => effect.trigger === "Static")?.keywords?.map((keyword) => keyword.keyword),
    ).toEqual(["Reboot", "Blocker", "Fortitude"]);
    expect(EffectDuration.UntilOpponentTurnEnd).toBeDefined();
  });

  it("reaches Callismon through its legal TS level-5 evolution and grants all three keywords", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT25-073", as: "tsBase" }],
        hand: [{ card: "BT25-058", as: "callismon" }],
      },
    });
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("tsBase").permanentId,
        instanceId: s.inst("callismon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tsBase").topCard?.cardId === "BT25-058");
    await s.ready();
    expect(s.state.memory).toBe(0);
    expect(
      compiled.effects.find((effect) => effect.trigger === "Static")?.keywords?.map((keyword) => keyword.keyword),
    ).toEqual(["Reboot", "Blocker", "Fortitude"]);
  });

  it("rejects the alternate evolution cost for a level-5 near-match without the TS trait", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-020", as: "wrongTraitBase" }],
        hand: [{ card: "BT25-058", as: "callismon" }],
      },
    });
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wrongTraitBase").permanentId,
        instanceId: s.inst("callismon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT25-058"]);
  });

  it.each([
    ["green", "BT1-075"],
    ["black", "BT10-064"],
  ] as const)("uses the ordinary %s Lv.5 evolution at cost 5", async (_color, source) => {
    const s = setupEngine({
      0: { battleArea: [{ card: source, as: "source" }], hand: [{ card: "BT25-058", as: "callismon" }] },
    });
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("callismon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard?.cardId === "BT25-058");
    expect(s.state.memory).toBe(1);
    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual([source]);
  });

  it("rejects a wrong-color non-TS Lv.5 source on the ordinary route", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-020", as: "redBase" }], hand: [{ card: "BT25-058", as: "callismon" }] },
    });
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redBase").permanentId,
        instanceId: s.inst("callismon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("redBase").topCard.cardId).toBe("BT1-020");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT25-058");
    expect(s.state.memory).toBe(6);
  });

  it("uses Blocker through a public opponent attack", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-058", as: "callismon" }], security: ["BT1-001"] },
      1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 6000 }] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("callismon"), "Blocker")).toBe(true);
    const attackerId = s.perm("attacker").permanentId;
    const securityBefore = s.state.players[0]!.security.length;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("callismon").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === attackerId));
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === attackerId)).toBe(false);
    expect(s.state.players[0]!.security.length).toBe(securityBefore);
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === s.perm("callismon").permanentId),
    ).toBe(true);
  });

  it("uses Reboot to unsuspend at the start of its controller's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-058", as: "callismon", suspended: true }], deck: ["BT1-001"] },
      1: { deck: ["BT1-002"] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("callismon"), "Reboot")).toBe(true);
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("callismon").isSuspended).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
  });

  it("uses Fortitude after a real deletion and trashes one source", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT25-058", as: "callismon", under: ["BT25-073"] }] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    const instanceId = s.perm("callismon").topCard.instanceId;
    expect(observe(s.engine).hasKeyword(s.perm("callismon"), "Fortitude")).toBe(true);
    expect(await advance(s.engine).verb.deletePermanent([s.perm("callismon").permanentId], "byEffect")).toBe(1);
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === instanceId),
    );
    const replay = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.instanceId === instanceId);
    expect(replay).toBeDefined();
    expect(replay?.topCard?.cardId).toBe("BT25-058");
    expect(replay?.stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).not.toContain("BT25-058");
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT25-073");
  });

  it("does not replay Fortitude when deletion has no source", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT25-058", as: "callismon" }] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    const id = s.perm("callismon").permanentId;
    expect(await advance(s.engine).verb.deletePermanent([id], "byEffect")).toBe(1);
    await settle(() => !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === id));
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT25-058");
  });

  it("fires When Digivolving once and shares that Once Per Turn budget with When Attacking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-073", as: "tsBase" }],
          hand: [{ card: "BT25-058", as: "callismon" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "suspendTarget" },
            { card: "BT1-009", as: "restrictTarget" },
          ],
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("tsBase").permanentId,
        instanceId: s.inst("callismon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const suspendDecision = s.state.pendingDecision!;
    expect(JSON.parse(suspendDecision.payloadJson)).toMatchObject({
      effectTextPart:
        "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] You may suspend 1 of your opponent's Digimon or Tamers.",
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: suspendDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("suspendTarget").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "chooseTargets" &&
        s.state.pendingDecision.decisionId !== suspendDecision.decisionId,
    );
    const restrictDecision = s.state.pendingDecision!;
    expect(JSON.parse(restrictDecision.payloadJson)).toMatchObject({
      effectTextPart: "Then, 1 of their Digimon or Tamers can't unsuspend until their turn ends.",
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: restrictDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("restrictTarget").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        observe(s.engine).hasRestriction(s.perm("restrictTarget"), "unsuspend") &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("suspendTarget").isSuspended).toBe(true);
    expect(observe(s.engine).hasRestriction(s.perm("restrictTarget"), "unsuspend")).toBe(true);

    await advance(s.engine).verb.unsuspend([s.perm("suspendTarget").permanentId]);
    expect(s.perm("suspendTarget").isSuspended).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("tsBase").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => false, 80);
    expect(s.perm("suspendTarget").isSuspended).toBe(false);
  });

  it("On Play can suspend one opponent and restrict a different Digimon/Tamer", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT25-058", as: "callismon" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "digimon", dp: 14000 },
            { card: "BT1-085", as: "tamer" },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 13;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("callismon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const suspendDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: suspendDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("tamer").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "chooseTargets" &&
        s.state.pendingDecision.decisionId !== suspendDecision.decisionId,
    );
    const restrictDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: restrictDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("digimon").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasRestriction(s.perm("digimon").permanentId, "unsuspend"));

    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.perm("digimon").isSuspended).toBe(false);
    expect(observe(s.engine).hasRestriction(s.perm("digimon").permanentId, "unsuspend")).toBe(true);

    const declined = setupEngine(
      {
        0: { hand: [{ card: "BT25-058", as: "callismon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    declined.state.memory = 13;
    expect(
      declined.engine.applyIntent(0, { type: "playCard", instanceId: declined.inst("callismon").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => observe(declined.engine).hasRestriction(declined.perm("target"), "unsuspend"));
    expect(declined.perm("target").isSuspended).toBe(false);
    expect(observe(declined.engine).hasRestriction(declined.perm("target").permanentId, "unsuspend")).toBe(true);
  });

  it("expires the cannot-unsuspend restriction at the opponent's turn end", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT25-058", as: "callismon" }], deck: ["BT1-001"] },
        1: { battleArea: [{ card: "BT1-009", as: "target" }], deck: ["BT1-002"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 13;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("callismon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasRestriction(s.perm("target"), "unsuspend"));
    expect(observe(s.engine).hasRestriction(s.perm("target"), "unsuspend")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);
    expect(observe(s.engine).hasRestriction(s.perm("target"), "unsuspend")).toBe(false);
  });

  it("When Attacking includes opponent Tamers and Digimon, with the player attack as the combat boundary", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-058", as: "callismon" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "target" },
            { card: "BT1-085", as: "tamer" },
          ],
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("callismon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasRestriction(s.perm("target").permanentId, "unsuspend"));
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("All Turns de-digivolves on effect-play, including self-play, then offers a direct battle once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-058", as: "callismon" }],
          hand: [
            { card: "BT1-009", as: "triggerOne" },
            { card: "BT1-009", as: "triggerTwo" },
          ],
        },
        1: { battleArea: [{ card: "BT24-017", as: "opponent", under: ["BT1-020", "BT1-019"] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.playInstances([s.inst("triggerOne").instanceId], "BT25-058");
    await settle(() => s.perm("opponent").stack.length === 1);
    expect(s.perm("opponent").stack).toHaveLength(1);
    await advance(s.engine).verb.playInstances([s.inst("triggerTwo").instanceId], "BT25-058");
    await settle(() => false, 80);
    expect(s.perm("opponent").stack).toHaveLength(1);

    const selfPlay = setupEngine(
      {
        0: { hand: [{ card: "BT25-058", as: "callismon" }] },
        1: { battleArea: [{ card: "BT24-017", as: "opponent", under: ["BT1-020"] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await advance(selfPlay.engine).verb.playInstances([selfPlay.inst("callismon").instanceId], "BT25-058");
    await settle(() => selfPlay.perm("opponent").stack.length === 0);
    expect(selfPlay.perm("opponent").stack).toHaveLength(0);

    const effectDigivolve = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-058", as: "callismon" },
            { card: "BT1-009", as: "effectBase" },
          ],
          hand: [{ card: "BT25-066", as: "effectEvolution" }],
        },
        1: { battleArea: [{ card: "BT24-017", as: "opponent", under: ["BT1-020"] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await advance(effectDigivolve.engine).verb.digivolveFromInstance(
      effectDigivolve.perm("effectBase").permanentId,
      effectDigivolve.inst("effectEvolution").instanceId,
      { payCost: false, draw: false, ignoreRequirements: true },
    );
    await settle(() => effectDigivolve.perm("opponent").stack.length === 0);
    expect(effectDigivolve.perm("opponent").stack).toHaveLength(0);

    const battle = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-058", as: "callismon" }], hand: [{ card: "BT1-009", as: "trigger" }] },
        1: { battleArea: [{ card: "BT1-009", as: "opponent", dp: 7000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await battle.ready();
    await advance(battle.engine).verb.playInstances([battle.inst("trigger").instanceId], "BT25-058");
    await settle(() => battle.state.players[1]!.battleArea.length === 0);
    expect(battle.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("does not trigger All Turns for an ordinary play", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-058", as: "callismon" }], hand: [{ card: "BT1-009", as: "ordinary" }] },
        1: { battleArea: [{ card: "BT24-017", as: "opponent", under: ["BT1-020"] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ordinary").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("ordinary").instanceId,
      ),
    );
    expect(s.perm("opponent").stack).toHaveLength(1);
  });

  it("does not trigger All Turns for a normal digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-058", as: "callismon" },
            { card: "BT25-062", as: "base" },
          ],
          hand: [{ card: "BT25-066", as: "evolution" }],
        },
        1: { battleArea: [{ card: "BT24-017", as: "opponent", under: ["BT1-020"] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.instanceId === s.inst("evolution").instanceId);
    expect(s.perm("opponent").stack).toHaveLength(1);
  });
});

describe("BT25-058 Callismon — KB Q&A rulings", () => {
  it("suspends one Digimon and keeps a different one from unsuspending (Q6345)", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT25-058", as: "callismon" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "suspended", dp: 14000 },
            { card: "BT1-010", as: "locked", dp: 14000 },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 13;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("callismon").instanceId })).toEqual({
      ok: true,
    });
    for (const alias of ["suspended", "locked"]) {
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm(alias).permanentId] },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => observe(s.engine).hasRestriction(s.perm("locked").permanentId, "unsuspend"));

    expect(s.perm("suspended").isSuspended).toBe(true);
    expect(observe(s.engine).hasRestriction(s.perm("suspended").permanentId, "unsuspend")).toBe(false);
    expect(s.perm("locked").isSuspended).toBe(false);
    expect(observe(s.engine).hasRestriction(s.perm("locked").permanentId, "unsuspend")).toBe(true);
  });

  it("triggers its [All Turns] effect when an effect plays this Callismon itself (Q6346)", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT25-058", as: "callismon" }] },
        1: { battleArea: [{ card: "BT24-017", as: "opponent", under: ["BT1-020"] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("callismon").instanceId], "BT25-054");
    await settle(() => s.perm("opponent").stack.length === 0);

    expect(s.perm("opponent").topCard.cardId).toBe("BT1-020");
  });

  it("triggers its [All Turns] effect when an effect digivolves a Digimon into this Callismon (Q6346)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-054", as: "grizzly", dp: 12000 }],
          hand: [{ card: "BT25-058", as: "callismon" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "loser", suspended: true },
            { card: "BT24-017", as: "opponent", under: ["BT1-020"], dp: 20000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Battle", "Suspend"] },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("grizzly").permanentId,
        target: { kind: "permanent", permanentId: s.perm("loser").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("grizzly").topCard.cardId === "BT25-058" && s.perm("opponent").stack.length === 0);

    expect(s.perm("opponent").topCard.cardId).toBe("BT1-020");
  });

  it("must De-Digivolve, while the battle that follows is optional (Q6347)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-058", as: "callismon" }], hand: [{ card: "BT1-009", as: "trigger" }] },
        1: { battleArea: [{ card: "BT24-017", as: "opponent", under: ["BT1-020"], dp: 3000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("trigger").instanceId], "BT25-054");
    await settle(() => s.perm("opponent").stack.length === 0 && s.state.pendingDecision === undefined);
    await drainMicrotasks();

    const callismonOptionals = s.decisions.filter(
      ({ req }) => req.kind === "optional" && req.sourceCardId === "BT25-058",
    );
    expect(callismonOptionals.map(({ req }) => req.promptText)).toEqual(["Battle"]);
    expect(callismonOptionals[0]!.req.options).toMatchObject({
      effectTextPart: "Then, this Digimon may battle 1 of your opponent's Digimon.",
    });
    expect(s.perm("opponent").topCard.cardId).toBe("BT1-020");
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  /** Trigger Callismon's [All Turns] with an effect play and accept its optional battle. */
  async function battleAfterEffectPlay(opponent: PermanentSpec) {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-058", as: "callismon" }], hand: [{ card: "BT1-009", as: "trigger" }] },
        1: { battleArea: [{ ...opponent, as: "opponent" }], security: ["BT1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.playInstances([s.inst("trigger").instanceId], "BT25-054");
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
    return s;
  }

  it("battles directly under the standard rules, without an attack (Q6348)", async () => {
    const s = await battleAfterEffectPlay({ card: "BT1-009", dp: 7000 });

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT1-009");
    expect(s.perm("callismon").isSuspended).toBe(false);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("battles a Digimon unaffected by effects, which is deleted by the rules when it loses (Q6349)", async () => {
    const s = await battleAfterEffectPlay({ card: "BT15-047", suspended: true });

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT15-047");
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === s.perm("callismon").permanentId)).toBe(true);
  });
});
