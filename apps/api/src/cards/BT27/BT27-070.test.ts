import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("Craniamon (X Antibody)", () => {
  it("cannot be played as a Digimon despite the Option use cost", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "BT27-070", as: "card" }] } });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "digimon" }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT27-070"]);
  });

  it("preserves a legal evolution stack and its inherited Reboot bonus after paying the named source", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-063", as: "base", under: ["ST5-08"] }],
          hand: [
            { card: "BT3-075", as: "craniamon" },
            { card: "BT27-070", as: "evolution" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("craniamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT3-075" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(6);
    expect(s.perm("base").currentDP).toBe(12000);
    expect([...s.perm("base").keywords]).not.toContain("SecurityAttack");
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-070" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(4);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["ST5-08", "BT2-063", "BT3-075"]);
    expect(s.perm("base").currentDP).toBe(13000);
    expect([...s.perm("base").keywords]).toEqual(expect.arrayContaining(["Reboot", "Blocker", "SecurityAttack"]));
    await advance(s.engine).verb.suspend([s.perm("base").permanentId]);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["ST5-08", "BT2-063"]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(["BT3-075"]);
    expect(s.perm("base").currentDP).toBe(18000);
    expect(s.perm("base").isSuspended).toBe(false);
    expect([...s.perm("base").keywords]).toContain("SecurityAttack");
    expect(s.state.memory).toBe(4);
  });

  it("suspends to protect an ally and deletes all tied lowest-DP opponents", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source" },
            { card: "BT1-009", as: "ally" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-009" }, { card: "BT1-084" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("ally").permanentId]);
    expect(s.perm("source").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-084"]);
  });
  it("may decline deletion and still pay a named source to activate the Option Main", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-070", as: "source", under: ["BT3-075"] }] },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Delete"] },
    );
    await s.ready();
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(["BT3-075"]);
    expect(s.perm("source").currentDP).toBe(18000);
    expect(s.perm("source").isSuspended).toBe(false);
  });
  it("cannot pay a second suspension while already suspended", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source", suspended: true },
            { card: "BT1-009", as: "ally" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("ally").permanentId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });
  it("grants the same Blocker 5000 DP and then may unsuspend it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-070", as: "source", suspended: true }],
          hand: [{ card: "BT27-070", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("option").instanceId));
    expect(s.perm("source").currentDP).toBe(18000);
    expect(s.perm("source").isSuspended).toBe(false);
  });
  it("protects all simultaneously removed allies with one suspension", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source" },
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("first").permanentId, s.perm("second").permanentId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.perm("source").isSuspended).toBe(true);
  });

  it("may refuse protection and let the ally leave", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source" },
            { card: "BT1-009", as: "ally" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("ally").permanentId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("source").isSuspended).toBe(false);
  });

  it("does not trigger on another Digimon suspending and deletes only once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source" },
            { card: "BT1-009", as: "ally" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-084" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-084"]);
    await advance(s.engine).verb.unsuspend([s.perm("source").permanentId]);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-084"]);
  });

  it.each(["BT3-075", "EX5-070"])("trashes the exact named source %s to activate the Option Main", async (card) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-070", as: "source", under: [card] }] } },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.state.players[0]!.trash.map((c) => c.cardId)).toContain(card);
    expect(s.perm("source").currentDP).toBe(18000);
    expect(s.perm("source").isSuspended).toBe(false);
  });

  it.each(["BT9-109", "BT27-070", "BT1-009"])(
    "cannot pay the source cost with protected or non-matching %s",
    async (card) => {
      const s = setupEngine(
        { 0: { battleArea: [{ card: "BT27-070", as: "source", under: [card] }] } },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
      expect(s.state.players[0]!.trash).toHaveLength(0);
      expect(s.perm("source").currentDP).toBe(13000);
      expect(s.perm("source").isSuspended).toBe(true);
    },
  );

  it("may refuse both deletion and the source cost", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-070", as: "source", under: ["BT3-075"] }] },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("source").currentDP).toBe(13000);
  });

  it.each([
    { base: "BT3-075", cost: 2 },
    { base: "BT2-063", cost: 4 },
  ])("digivolves over $base for $cost memory", async ({ base, cost }) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: base, as: "base" }],
          hand: [{ card: "BT27-070", as: "evolution" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-070" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(10 - cost);
    expect(s.perm("base").stack.map((c) => c.cardId)).toContain(base);
    expect(s.perm("base").currentDP).toBe(13000);
  });

  it("rejects an unrelated level six evolution base", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT2-065", as: "base" }], hand: [{ card: "BT27-070", as: "evolution" }] },
    });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
  });

  it("limits the Option bonus to a Blocker and permits refusing the unsuspend", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-009", as: "plain", suspended: true },
            { card: "BT27-070", as: "source", suspended: true },
          ],
          hand: [{ card: "BT27-070", as: "option" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-070"));
    expect(s.perm("plain").currentDP).toBe(3000);
    expect(s.perm("plain").isSuspended).toBe(true);
    expect(s.perm("source").currentDP).toBe(18000);
    expect(s.perm("source").isSuspended).toBe(true);
    await advance(s.engine).verb.unsuspend([s.perm("source").permanentId]);
    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId], 1);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.perm("source").isSuspended).toBe(false);
    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId], 1);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.perm("source").isSuspended).toBe(true);
  });

  it("keeps the bonus through the opponent turn and expires it afterward", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-070", as: "source" }],
          hand: [{ card: "BT27-070", as: "option" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { deck: ["BT1-009", "BT1-009"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-070"));
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.perm("source").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
    expect(s.perm("source").currentDP).toBe(18000);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("source").isSuspended).toBe(false);
    expect(s.perm("source").currentDP).toBe(18000);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    expect(s.perm("source").currentDP).toBe(13000);
    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId], 1);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.perm("source").isSuspended).toBe(true);
  });
  it("protects itself from returning to hand by suspending", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-070", as: "source" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.returnToHand([s.inst("source").instanceId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.perm("source").isSuspended).toBe(true);
  });

  it("can unsuspend a non-Blocker even when no Digimon qualifies for the bonus", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-063", as: "base", suspended: true }],
          hand: [{ card: "BT27-070", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    const dp = s.perm("base").currentDP;
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-070"));
    expect(s.perm("base").currentDP).toBe(dp);
    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.state.memory).toBe(5);
  });

  it("Arts Digivolves the used Option onto a legal stack without an evolution cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-063", as: "base", suspended: true }],
          hand: [{ card: "BT27-070", as: "option" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-070");
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").stack.map((c) => c.cardId)).toContain("BT2-063");
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });
  it("does not trash a qualifying source under a different Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source" },
            { card: "BT1-009", as: "ally", under: ["EX5-070"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.perm("ally").stack.map((c) => c.cardId)).toEqual(["EX5-070"]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("source").currentDP).toBe(13000);
  });

  it("refreshes the suspension trigger on the opponent turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-070", as: "source" }], deck: ["BT1-009", "BT1-009"] },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-084" }], deck: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("source").isSuspended).toBe(false);
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
  });
  it("highlights the active deletion, source payment, Option bonus and unsuspend clauses in sequence", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source", under: ["BT3-075"] },
            { card: "ST5-08", as: "otherBlocker" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.suspend([s.perm("source").permanentId]);
    const deletion =
      "[All Turns] [Once Per Turn] When this Digimon suspends, you may delete all of your opponent's lowest DP Digimon.";
    const sourcePayment =
      "Then, by trashing 1 [Craniamon] or [X Antibody] from this Digimon's digivolution cards, activate 1 [Main] effect on this card's Option side.";
    const optionBonus =
      "[Main] Until your opponent's turn ends, 1 of your Digimon with ＜Blocker＞ isn't affected by their Digimon effects and gets +5000 DP.";
    const unsuspend = "Then, 1 of your Digimon may unsuspend.";
    const options = s.decisions.map(({ req }) => req.options);
    expect([...new Set(options.map((option) => option?.effectTextEmphasis))]).toEqual([
      deletion,
      sourcePayment,
      optionBonus,
      unsuspend,
    ]);
    for (const emphasis of [deletion, sourcePayment]) {
      expect(options).toContainEqual(
        expect.objectContaining({
          timing: "AllTurns",
          effectText: `${deletion} ${sourcePayment}`,
          effectTextEmphasis: emphasis,
        }),
      );
    }
    for (const emphasis of [optionBonus, unsuspend]) {
      expect(options).toContainEqual(
        expect.objectContaining({
          timing: "Main",
          effectText: `${optionBonus} ${unsuspend}\n＜Arts Digivolve＞`,
          effectTextEmphasis: emphasis,
        }),
      );
    }
    expect(s.perm("source").currentDP).toBe(18000);
    expect(s.perm("source").isSuspended).toBe(false);
  });

  it("highlights each Option clause when the card is used directly from hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-070", as: "source", suspended: true },
            { card: "ST5-08", as: "otherBlocker" },
          ],
          hand: [{ card: "BT27-070", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("option").instanceId));
    const options = s.decisions.map(({ req }) => req.options);
    expect(options).toContainEqual(
      expect.objectContaining({
        timing: "Main",
        effectTextEmphasis:
          "[Main] Until your opponent's turn ends, 1 of your Digimon with ＜Blocker＞ isn't affected by their Digimon effects and gets +5000 DP.",
      }),
    );
    expect(options).toContainEqual(
      expect.objectContaining({ timing: "Main", effectTextEmphasis: "Then, 1 of your Digimon may unsuspend." }),
    );
    expect(s.perm("source").currentDP).toBe(18000);
    expect(s.perm("source").isSuspended).toBe(false);
  });
});
