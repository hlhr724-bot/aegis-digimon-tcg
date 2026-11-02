import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT21-077.js";
import "../index.js";
describe("BT21-077 Regulusmon", () => {
  it("costs a Gammamon card to grant Collision and recurs on deletion", () => {
    const action = compiled.effects.find((e) => e.trigger === "OnPlay")?.actions[0];
    expect(action).toMatchObject({
      kind: "GainKeyword",
      keyword: { keyword: "Collision" },
      cost: {
        kind: "trash",
        target: { filter: { zone: "hand", nameOrTrait: [{ tokens: ["Gammamon"], match: "text" }] } },
      },
      optional: true,
      abortOnDecline: true,
    });
    expect(compiled.effects.find((e) => e.trigger === "OnPlay")?.actions[1]).toMatchObject({
      kind: "GainTriggeredEffect",
      target: { sameTarget: true },
      gainedTrigger: "StartOfYourMainPhase",
    });
    expect(compiled.effects.filter((e) => e.trigger === "OnDeletion")).toHaveLength(2);
    expect(compiled.effects.find((e) => e.trigger === "OnDeletion" && !e.isInherited)?.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      target: {
        filter: {
          or: expect.arrayContaining([{ nameOrTrait: [{ tokens: ["Canoweissmon"], match: "nameExact" }] }]),
        },
      },
    });
    expect(compiled.effects.find((e) => e.trigger === "OnDeletion" && e.isInherited)?.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      from: ["trash"],
      optional: true,
    });
    expect(compiled.digivolutionRequirement).toEqual([{ level: 4, texts: ["Gammamon"], cost: 3, isAlternate: true }]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("trashes a Gammamon-text card and grants both effects to the same opponent", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-077", as: "regulusmon" }],
          hand: [{ card: "BT21-010", as: "cost" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "target" },
            { card: "BT1-010", as: "other" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("cost").instanceId, s.perm("target").permanentId);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("regulusmon"));
    await settle(() => observe(s.engine).hasKeyword(s.perm("target"), "Collision"));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("other"), "Collision")).toBe(false);
  });

  it("resolves the printed grant through a public play intent", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-077", as: "regulusmon" },
            { card: "BT21-010", as: "gammamon-cost" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "target" },
            { card: "BT1-010", as: "other" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("gammamon-cost").instanceId, s.perm("target").permanentId);
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("regulusmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(s.perm("target"), "Collision"));

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("gammamon-cost").instanceId)).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("other"), "Collision")).toBe(false);
  });

  it("publicly triggers the selected opponent's gained attack at their next main phase", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-077", as: "regulusmon" },
            { card: "BT21-010", as: "gammamon-cost" },
          ],
          battleArea: [{ card: "BT21-059", as: "blocker" }],
          security: ["BT1-001", "BT1-002"],
          deck: ["BT1-003", "BT1-004", "BT1-005"],
        },
        1: {
          battleArea: [{ card: "BT1-080", as: "target" }],
          security: ["BT1-001", "BT1-002"],
          deck: ["BT1-003", "BT1-004", "BT1-005"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    const targetId = s.perm("target").permanentId;
    const blockerId = s.perm("blocker").permanentId;
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    preferred.push(s.inst("gammamon-cost").instanceId, s.perm("target").permanentId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("regulusmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(s.perm("target"), "Collision"));
    const regulusmonId = s.perm("regulusmon").permanentId;
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
    s.state.turnSeat = 1;
    s.state.memory = 0;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(observe(s.engine).hasKeyword(targetId, "Collision")).toBe(true);
    expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: blockerId })).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "combatResolved") && !observe(s.engine).isAttacking());
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("blocker").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === regulusmonId)).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(2);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(false);
  });

  it.each([
    ["declined", "BT21-010", true],
    ["nonmatching", "BT1-009", false],
  ] as const)("does not pay or grant when the cost is %s", async (_label, costCard, decline) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT21-077", as: "regulusmon" }], hand: [{ card: costCard, as: "cost" }] },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      decline
        ? { autoDeclineOptional: true, autoSelectCards: true }
        : { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("regulusmon"));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(false);
  });

  it.each([
    ["Canoweissmon", "BT21-022"],
    ["level-4 Gammamon-text", "BT21-069"],
  ])("main deletion plays %s from trash", async (_label, card) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT21-077", as: "regulusmon" }], trash: [{ card, as: "played" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("regulusmon").permanentId], "byEffect")).toBe(1);
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("played").instanceId),
    );
  });

  it("main deletion offers only Canoweissmon or level-4-or-lower Gammamon-text Digimon from its owner's trash", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-077", as: "regulusmon" }],
          trash: [
            { card: "BT21-077", as: "levelFiveRegulusmon" },
            { card: "BT1-009", as: "noGammamonText" },
            { card: "BT21-022", as: "canoweissmon" },
            { card: "BT21-069", as: "levelFourGammamonText" },
          ],
        },
        1: { trash: [{ card: "BT1-009", as: "opponentTrashDigimon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("levelFourGammamonText").instanceId);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("regulusmon").permanentId], "byEffect")).toBe(1);
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("levelFourGammamonText").instanceId,
      ),
    );

    const offered = s.decisions
      .filter(({ req }) => req.kind === "selectCards" && req.options?.effectKey === "BT21-077/ir-11-0")
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect([...offered].sort()).toEqual(
      [s.inst("canoweissmon").instanceId, s.inst("levelFourGammamonText").instanceId].sort(),
    );
  });

  it("publicly deletes Regulusmon in battle and plays Canoweissmon from trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-077", as: "regulusmon" }],
          trash: [{ card: "BT21-022", as: "canoweissmon" }],
        },
        1: { battleArea: [{ card: "AD1-002", as: "blocker", suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const attackerId = s.perm("regulusmon").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "permanent", permanentId: s.perm("blocker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((event) => event.kind === "combatResolved") &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-022") &&
        !observe(s.engine).isAttacking(),
    );

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-077")).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-022")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT21-022")).toBe(false);
  });

  it("publicly deletes a host and resolves the inherited Gammamon-text recovery", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-078", as: "host", under: [{ card: "BT21-077", as: "source" }] }],
          trash: [{ card: "BT21-069", as: "gammamonText" }],
        },
        1: { battleArea: [{ card: "AD1-004", as: "blocker", suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const hostId = s.perm("host").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: hostId,
        target: { kind: "permanent", permanentId: s.perm("blocker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((event) => event.kind === "combatResolved") &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-069") &&
        !observe(s.engine).isAttacking(),
    );

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === hostId)).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-069")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT21-069")).toBe(false);
  });

  it("inherited deletion plays level-4 Gammamon text but not Canoweissmon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-078", as: "host", under: [{ card: "BT21-077", as: "source" }] }],
          trash: [
            { card: "BT21-069", as: "gulus" },
            { card: "BT21-022", as: "canoweissmon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("gulus").instanceId);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);
    await settle(() =>
      s.state.players[0]!.battleArea.some((card) => card.topCard.instanceId === s.inst("gulus").instanceId),
    );
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("canoweissmon").instanceId)).toBe(true);
  });

  it("uses the level-4 Gammamon-text alternate evolution route for 3", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-069", as: "gulus" }],
        hand: [{ card: "BT21-077", as: "regulusmon" }],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("gulus").permanentId,
        instanceId: s.inst("regulusmon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("gulus").topCard.instanceId === s.inst("regulusmon").instanceId);
    expect(s.state.memory).toBe(1);
  });
  it.each(["play", "digivolve"] as const)(
    "pays the optional trash cost through public %s without an opponent Digimon",
    async (route) => {
      const s = setupEngine(
        {
          0: {
            battleArea: route === "digivolve" ? [{ card: "BT21-069", as: "base" }] : [],
            hand: [
              { card: "BT21-077", as: "regulus" },
              { card: "BT21-010", as: "cost" },
            ],
            deck: ["BT1-001"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();
      expect(
        s.engine.applyIntent(
          0,
          route === "play"
            ? { type: "playCard", instanceId: s.inst("regulus").instanceId }
            : {
                type: "digivolve",
                permanentId: s.perm("base").permanentId,
                instanceId: s.inst("regulus").instanceId,
                alternateRequirementIndex: 0,
              },
        ),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId));
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(false);
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
    },
  );
});

describe("BT21-077 Regulusmon — KB Q&A rulings", () => {
  const FILLER_DECK = ["BT1-009", "BT1-009", "BT1-009", "BT1-009"];

  it("accepts any hand card with [Gammamon] in its name or only in its effect text as the trash cost (Q4586)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-077", as: "regulusmon" },
            { card: "BT21-080", as: "gammamonOnlyInEffectText" },
            { card: "BT21-019", as: "gammamonInsideName" },
            { card: "BT1-009", as: "noGammamonText" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    preferred.push(s.inst("noGammamonText").instanceId, s.inst("gammamonOnlyInEffectText").instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("regulusmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(s.perm("target"), "Collision"));

    const offered = s.decisions.flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(offered).toEqual(
      expect.arrayContaining([s.inst("gammamonOnlyInEffectText").instanceId, s.inst("gammamonInsideName").instanceId]),
    );
    expect(offered).not.toContain(s.inst("noGammamonText").instanceId);
    const trashIds = s.state.players[0]!.trash.map((card) => card.instanceId);
    expect(trashIds).toContain(s.inst("gammamonOnlyInEffectText").instanceId);
    expect(trashIds).not.toContain(s.inst("noGammamonText").instanceId);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(true);
  });

  async function grantAttackThenRunOpponentMain(
    target: { card: string; suspended: boolean },
    opponentMemoryAtTurnStart: number,
  ): Promise<{ attacked: boolean; blockWindowOpened: boolean }> {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-077", as: "regulusmon" },
            { card: "BT21-010", as: "gammamonCost" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009"],
          deck: [...FILLER_DECK],
        },
        1: {
          battleArea: [{ card: target.card, as: "target", suspended: target.suspended }],
          security: ["BT1-009", "BT1-009"],
          deck: [...FILLER_DECK],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    preferred.push(s.inst("gammamonCost").instanceId, s.perm("target").permanentId);
    const targetId = s.perm("target").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("regulusmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("gammamonCost").instanceId));
    await settle();

    s.state.turnSeat = 1;
    s.state.memory = opponentMemoryAtTurnStart;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    // Collision forces a block when the gained attack happens; answer it so the attack finishes.
    await settle(
      () => !observe(s.engine).isAttacking() || s.events.some((event) => event.kind === "blockWindowOpened"),
    );
    const forcedBlocker = s.state.players[0]!.battleArea.find((permanent) => !permanent.isSuspended);
    if (observe(s.engine).isAttacking() && forcedBlocker !== undefined) {
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: forcedBlocker.permanentId });
    }
    await settle(() => !observe(s.engine).isAttacking());
    const attacked = s.events.some(
      (event) => event.kind === "attackDeclared" && event.attackerPermanentId === targetId,
    );
    const blockWindowOpened = s.events.some((event) => event.kind === "blockWindowOpened");
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    return { attacked, blockWindowOpened };
  }

  it("can give the gained attack to a Digimon unaffected at that moment, but it triggers only if the Digimon is affected when its timing arrives (Q4587)", async () => {
    const suspendedTyrantKabuterimon = { card: "BT16-048", suspended: true };
    const gallantmon = { card: "BT17-016", suspended: false };

    expect((await grantAttackThenRunOpponentMain(suspendedTyrantKabuterimon, 3)).attacked).toBe(true);
    expect((await grantAttackThenRunOpponentMain(gallantmon, 0)).attacked).toBe(false);
    expect((await grantAttackThenRunOpponentMain(gallantmon, 3)).attacked).toBe(true);
  });

  it("does not activate the granted Collision once TyrantKabuterimon suspends to make its gained attack (Q5001)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-077", as: "regulusmon" },
            { card: "BT21-010", as: "gammamonCost" },
          ],
          battleArea: [{ card: "BT1-009", as: "nonBlocker" }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
          deck: [...FILLER_DECK],
        },
        1: {
          battleArea: [{ card: "BT16-048", as: "tyrantKabuterimon" }],
          security: ["BT1-009", "BT1-009"],
          deck: [...FILLER_DECK],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    preferred.push(s.inst("gammamonCost").instanceId, s.perm("tyrantKabuterimon").permanentId);
    const tyrantId = s.perm("tyrantKabuterimon").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("regulusmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(tyrantId, "Collision"));
    expect(observe(s.engine).hasKeyword(tyrantId, "Collision")).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    await settle(
      () =>
        s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === tyrantId) &&
        !observe(s.engine).isAttacking(),
    );

    expect(s.perm("tyrantKabuterimon").isSuspended).toBe(true);
    expect(s.events.some((event) => event.kind === "blockWindowOpened")).toBe(false);
    expect(s.perm("nonBlocker").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(2);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    const affectedAttacker = { card: "BT1-009", suspended: false };
    expect(await grantAttackThenRunOpponentMain(affectedAttacker, 3)).toEqual({
      attacked: true,
      blockWindowOpened: true,
    });
  });
});
