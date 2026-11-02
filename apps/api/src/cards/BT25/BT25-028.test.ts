import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled as BT25_028 } from "./BT25-028.js";
import "../index.js";

describe("BT25-028 Dianamon", () => {
  it("applies the level-6 cost reduction only while an opponent has a level 6+ Digimon", () => {
    const effect = BT25_028.effects?.find((entry) => entry.trigger === "Static");
    expect(effect?.actions?.[0]).toMatchObject({
      kind: "Replacement",
      event: "wouldBePlayed",
      sourceFilter: { isSelfRef: true },
    });
    const nested = effect?.actions?.[0] as { actions?: unknown[] } | undefined;
    expect(nested?.actions?.[0]).toMatchObject({
      kind: "Replacement",
      mode: "reduceCost",
      amount: 5,
      condition: {
        kind: "opponentHas",
        filter: { controllerDefault: "opponent", kind: ["Digimon"], levelComparison: { op: "gte", value: 6 } },
      },
    });
  });

  it("targets the snapshot of low-stack Digimon, then deletes one remaining unsuspended Digimon", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      const effect = BT25_028.effects?.find((entry) => entry.trigger === trigger);
      expect(effect?.actions?.[0]).toMatchObject({
        kind: "Restrict",
        restriction: "suspend",
        duration: "untilOpponentTurnEnd",
        whileMatchesTargetFilter: true,
        target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCardsAtMost: 1 }, count: "all" },
      });
      expect(effect?.actions?.[1]).toMatchObject({
        kind: "Delete",
        target: { filter: { controller: "opponent", kind: ["Digimon"], unsuspended: true }, count: 1 },
      });
    }
  });

  it("triggers the All Turns discard-and-DNA sequence for any Digimon being played or digivolving", () => {
    const effect = BT25_028.effects?.find((entry) => entry.trigger === "AllTurns");
    expect(effect?.frequency).toBe("OncePerTurn");
    expect(effect?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "whenPlayed", sourceFilter: { controllerDefault: "any", kind: ["Digimon"] } }),
        expect.objectContaining({
          event: "whenAnyDigivolves",
          sourceFilter: { controllerDefault: "any", kind: ["Digimon"] },
        }),
        expect.objectContaining({ event: "whenPlayed" }),
        expect.objectContaining({ event: "whenAnyDigivolves" }),
      ]),
    );
    for (const watcher of effect?.actions?.filter((action) => action.kind === "SubTrigger") ?? []) {
      expect(watcher.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "TrashDigivolution", amount: 4, scope: "acrossDigimon", optional: true }),
          expect.objectContaining({
            kind: "DnaDigivolve",
            materials: { filter: { controller: "mine", kind: ["Digimon"] }, count: 2 },
            into: {
              controllerDefault: "mine",
              zone: "hand",
              nameOrTrait: [{ tokens: ["GraceNovamon"], match: "nameExact" }],
            },
            payCost: true,
            optional: true,
          }),
        ]),
      );
    }
  });

  it("reduces play cost only against an opponent level 6 or higher", async () => {
    const reduced = setupEngine({
      0: { hand: [{ card: "BT25-028", as: "diana" }] },
      1: { battleArea: [{ card: "BT1-043", as: "level6" }] },
    });
    reduced.state.memory = 7;
    expect(reduced.engine.applyIntent(0, { type: "playCard", instanceId: reduced.inst("diana").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => reduced.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-028"));
    expect(reduced.state.memory).toBe(0);

    const below = setupEngine({
      0: { hand: [{ card: "BT25-028", as: "diana" }] },
      1: { battleArea: [{ card: "BT25-017", as: "level5" }] },
    });
    below.state.memory = 7;
    expect(below.engine.applyIntent(0, { type: "playCard", instanceId: below.inst("diana").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => below.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-028"));
    expect(below.state.memory).toBe(-5);
  });

  it("keeps the low-stack lock live for entrants, releases it at 2 sources, and expires at turn end", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT25-028", as: "diana" }] },
        1: {
          battleArea: [{ card: "BT1-009", as: "initial", suspended: true, under: ["BT1-001"] }],
          hand: [
            { card: "BT1-014", as: "level4" },
            { card: "BT1-020", as: "level5" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 12;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("diana").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-028"));

    const entrant = s.putOnBoard(1, { card: "BT1-009", as: "entrant", under: ["BT1-001"] });
    await s.ready();
    await advance(s.engine).verb.suspend([entrant.permanentId]);
    expect(entrant.isSuspended).toBe(false);

    const initial = s.perm("initial");
    await advance(s.engine).verb.unsuspend([initial.permanentId]);
    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: initial.permanentId,
        instanceId: s.inst("level4").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => initial.topCard.cardId === "BT1-014");
    await advance(s.engine).verb.suspend([initial.permanentId]);
    expect(initial.isSuspended).toBe(true);

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: initial.permanentId,
        instanceId: s.inst("level5").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => initial.topCard.cardId === "BT1-020");
    await advance(s.engine).verb.suspend([initial.permanentId]);
    expect(initial.isSuspended).toBe(true);

    const stacked = s.putOnBoard(1, {
      card: "BT1-009",
      as: "stacked",
      under: ["BT1-001"],
    });
    await s.ready();
    await advance(s.engine).verb.suspend([stacked.permanentId]);
    expect(stacked.isSuspended).toBe(false);

    advance(s.engine).ledgers.continuous.sweep(s.state, "opponentTurnEnd", 1);
    await advance(s.engine).verb.suspend([entrant.permanentId]);
    expect(entrant.isSuspended).toBe(true);
  });

  it("trashes four opponent digivolution cards and then DNA digivolves into GraceNovamon on a play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-028", as: "diana" },
            { card: "BT1-025", as: "redPartner" },
          ],
          hand: [
            { card: "BT25-103", as: "grace" },
            { card: "BT1-009", as: "played" },
          ],
        },
        1: { battleArea: [{ card: "BT1-025", as: "victim", under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    const victimStackIds = s.perm("victim").stack.map((card) => card.instanceId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-103") &&
        s.state.players[1]!.trash.length >= victimStackIds.length,
    );
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(expect.arrayContaining(victimStackIds));
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-103")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT25-103")).toBe(false);
  });

  it("supports the Q6489 opponent-attack effect-play, DNA, and Grace counter sequence", async () => {
    const s = setupEngine(
      {
        0: {
          security: ["BT1-001"],
          battleArea: [
            { card: "BT25-028", as: "diana" },
            { card: "BT1-025", as: "material" },
          ],
          hand: [{ card: "BT25-103", as: "grace" }],
        },
        1: {
          deck: ["BT1-001", "BT1-001", "BT1-001"],
          battleArea: [
            {
              card: "BT1-044",
              as: "attacker",
              under: ["BT1-003", "BT1-027", "AD1-010", "AD1-011"],
            },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const trashDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: trashDecision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const dnaDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: dnaDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-103") &&
        s.events.some((event) => event.kind === "counterWindowOpened"),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-103")).toBe(true);
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const graceCounter = opened.eligibleCounters.find(
      (entry) =>
        entry.instanceId ===
        s.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === "BT25-103")!.topCard!.instanceId,
    );
    expect(graceCounter).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: graceCounter!.instanceId,
        effectKey: graceCounter!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const counterTrash = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: counterTrash.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const endAttack = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: endAttack.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(observe(s.engine).isAttacking()).toBe(false);
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === s.perm("attacker").permanentId)).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("resolves the same restriction and deletion through a legal TS evolution stack", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-028", as: "diana" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "victim" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const host = s.putOnBoard(0, { card: "BT25-026", as: "crescemon" });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: host.permanentId,
        instanceId: s.inst("diana").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => host.topCard.cardId === "BT25-028" && host.stack.length === 1);
    expect(host.topCard.cardId).toBe("BT25-028");
    expect(host.stack.map((card) => card.cardId)).toEqual(["BT25-026"]);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT1-009");
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q6293: accepting All Turns DNA first must suppress Dianamon's pending On Play branch", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-025", as: "material" }],
          hand: [
            { card: "BT25-028", as: "diana" },
            { card: "BT25-103", as: "grace" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-025", as: "victimTrash", under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"] },
            { card: "BT1-025", as: "victimKeep", under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false, preferInstanceIds: preferred },
    );
    s.state.memory = 20;
    await s.ready();
    preferred.push(...s.perm("victimTrash").stack.map((card) => card.instanceId));
    const victimTrashId = s.perm("victimTrash").topCard.instanceId;
    const victimKeepId = s.perm("victimKeep").topCard.instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("diana").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const orderDecision = s.state.pendingDecision!;
    const orderRequest = s.decisions.find(({ req }) => req.decisionId === orderDecision.decisionId)!.req;
    const keys = orderRequest.options?.triggerKeys ?? [];
    expect(keys).toHaveLength(2);
    const allTurnsIndex = (orderRequest.options?.triggerDescriptions ?? []).findIndex((description) =>
      description.startsWith("[All Turns]"),
    );
    const allTurnsKey = keys[allTurnsIndex];
    expect(allTurnsKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: orderDecision.decisionId,
        response: { kind: "orderTriggers", order: [allTurnsKey!] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-103"));

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-103")).toBe(true);
    expect(s.state.players[1]!.deck).toContainEqual(expect.objectContaining({ instanceId: victimTrashId }));
    expect(s.state.players[1]!.trash).not.toContainEqual(expect.objectContaining({ instanceId: victimKeepId }));
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.instanceId)).toEqual([victimKeepId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("fires the same discard watcher when any Digimon digivolves", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-028", as: "diana" }],
          hand: [{ card: "BT1-009", as: "evolution" }],
        },
        1: { battleArea: [{ card: "BT1-025", as: "victim", under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const host = s.putOnBoard(0, { card: "BT1-001", as: "host" });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: host.permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("victim").stack.length === 0);
    expect(s.perm("victim").stack).toHaveLength(0);
  });

  it("is once per turn after an accepted play trigger and blocks a later play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-028", as: "diana" }],
          hand: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-009", as: "second" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-025", as: "firstVictim", under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"] },
            { card: "BT1-025", as: "secondVictim", under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("firstVictim").stack.length === 0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.filter((p) => p.topCard?.cardId === "BT1-009").length === 2);
    expect(s.perm("firstVictim").stack).toHaveLength(0);
    expect(s.perm("secondVictim").stack).toHaveLength(4);
  });

  it("publicly permits declining both optional trash and DNA steps without changing their zones", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-028", as: "diana" },
            { card: "BT1-025", as: "material" },
          ],
          hand: [
            { card: "BT25-103", as: "grace" },
            { card: "BT1-009", as: "played" },
          ],
        },
        1: { battleArea: [{ card: "BT1-025", as: "victim", under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    const victim = s.perm("victim");
    const material = s.perm("material");
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT1-009"));

    expect(victim.stack).toHaveLength(4);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT25-103");
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === material.permanentId)).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("inherited When Attacking prevents one opponent Digimon from suspending", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-028", as: "diana" }],
          hand: [{ card: "BT1-084", as: "omnimon" }],
          deck: ["BT1-001", "BT1-001", "BT1-001"],
        },
        1: { security: ["BT1-001", "BT1-001"], deck: ["BT1-001", "BT1-001", "BT1-001"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("diana").permanentId,
        instanceId: s.inst("omnimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("diana").topCard.cardId === "BT1-084");
    expect(s.perm("diana").stack.map((card) => card.cardId)).toContain("BT25-028");
    const target = s.putOnBoard(1, { card: "BT1-009", as: "target" });
    const tamer = s.putOnBoard(1, { card: "BT1-085", as: "tamer" });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("diana").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(observe(s.engine).isAttacking()).toBe(false);

    await advance(s.engine).verb.suspend([target.permanentId, tamer.permanentId]);
    expect(target.isSuspended).toBe(false);
    expect(tamer.isSuspended).toBe(true);

    preferred.push(tamer.permanentId);
    await advance(s.engine).verb.unsuspend([tamer.permanentId]);
    expect(tamer.isSuspended).toBe(false);
    await advance(s.engine).verb.unsuspend([s.perm("diana").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("diana").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(observe(s.engine).isAttacking()).toBe(false);
    await advance(s.engine).verb.suspend([tamer.permanentId]);
    expect(tamer.isSuspended).toBe(true);

    s.state.turnSeat = 1;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    expect(observe(s.engine).isRestricted(target, "beSuspended")).toBe(false);
    await advance(s.engine).verb.suspend([target.permanentId]);
    expect(target.isSuspended).toBe(true);
  });

  it("inherited When Attacking can instead choose an opposing Tamer", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-028", as: "diana" }], hand: [{ card: "BT1-084", as: "omnimon" }] },
        1: { security: ["BT1-001", "BT1-001"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("diana").permanentId,
        instanceId: s.inst("omnimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("diana").topCard.cardId === "BT1-084");
    const tamer = s.putOnBoard(1, { card: "BT1-085", as: "tamer" });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("diana").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    await advance(s.engine).verb.suspend([tamer.permanentId]);
    expect(tamer.isSuspended).toBe(false);
  });
});

describe("BT25-028 Dianamon — KB Q&A rulings", () => {
  it("triggers its [All Turns] watcher when this card itself is played (Q6292)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-025", as: "redPartner" }],
          hand: [{ card: "BT25-028", as: "diana" }],
        },
        1: {
          battleArea: [
            {
              card: "BT1-025",
              as: "victim",
              suspended: true,
              under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("diana").instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-028") &&
        s.perm("victim").stack.length === 0,
    );
    expect(s.perm("victim").stack).toHaveLength(0);
  });

  it("triggers its [All Turns] watcher when one of my Digimon digivolves into this card (Q6292)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-026", as: "host" }],
          hand: [{ card: "BT25-028", as: "diana" }],
        },
        1: {
          battleArea: [
            {
              card: "BT1-025",
              as: "victim",
              suspended: true,
              under: ["BT1-001", "BT1-009", "BT1-014", "BT1-020"],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("diana").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT25-028" && s.perm("victim").stack.length === 0);

    expect(s.perm("victim").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT1-001", "BT1-009", "BT1-014", "BT1-020"]),
    );
  });

  /**
   * Play Dianamon with no opposing Digimon on the board, then let an opposing Digimon with one
   * digivolution card enter the battle area after the effect resolved, and hand the turn over.
   */
  async function entrantAfterDianamon() {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT25-028", as: "diana" }], security: ["BT1-001", "BT1-002"], deck: ["BT1-003"] },
        1: { hand: [{ card: "BT1-014", as: "evolution" }], deck: ["BT1-004", "BT1-005"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("diana").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-028"));
    await settle(() => s.state.pendingDecision === undefined);
    s.putOnBoard(1, { card: "BT1-009", as: "entrant", under: ["BT1-001"] });
    await s.ready();
    s.state.turnSeat = 1;
    s.state.memory = 10;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    const attackPlayer = () =>
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("entrant").permanentId,
        target: { kind: "player" },
      });
    return { s, turn, attackPlayer };
  }

  it("keeps a Digimon with 1 or fewer digivolution cards that enters later from suspending (Q6294)", async () => {
    const { s, turn, attackPlayer } = await entrantAfterDianamon();

    expect(attackPlayer()).toMatchObject({ ok: false });
    expect(s.perm("entrant").isSuspended).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
  });

  it("lets that Digimon suspend again once it has 2 or more digivolution cards (Q6295)", async () => {
    const { s, turn, attackPlayer } = await entrantAfterDianamon();
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("entrant").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("entrant").topCard.cardId === "BT1-014" && s.state.pendingDecision === undefined);
    expect(s.perm("entrant").stack).toHaveLength(2);

    expect(attackPlayer()).toEqual({ ok: true });
    expect(s.perm("entrant").isSuspended).toBe(true);
    await advance(s.engine).finishAttack();
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
  });
});
