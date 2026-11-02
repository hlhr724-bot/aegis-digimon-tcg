import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { compiled as BT25_029 } from "./BT25-029.js";
import "../index.js";

describe("BT25-029 MirageGaogamon", () => {
  it("shares the Once Per Turn return sequence and requires one bottom face-down Tamer card", () => {
    for (const trigger of ["WhenDigivolving", "WhenAttacking"] as const) {
      const effect = BT25_029.effects?.find((entry) => entry.trigger === trigger);
      expect(effect).toMatchObject({ frequency: "OncePerTurn", sharedUseKey: "ir-shared-0" });
      expect(effect?.actions?.[0]).toMatchObject({
        kind: "Return",
        optional: true,
        to: "hand",
        target: {
          filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 5 } },
          count: 1,
        },
      });
      expect(effect?.actions?.[1]).toMatchObject({
        kind: "Return",
        optional: true,
        abortOnDecline: true,
        target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestLevel" }, count: 1 },
        cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
      });
    }
  });

  it("grants all three printed keywords on a public legal evolution", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT25-027", as: "base" }],
        hand: [{ card: "BT25-029", as: "mirage" }],
      },
    });
    await s.ready();
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT25-029");
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Reboot")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Evade")).toBe(true);
  });

  it("pays the ordinary blue evolution cost from a legal level-5 host", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-027", as: "base" }], hand: [{ card: "BT25-029", as: "mirage" }] },
    });
    await s.ready();
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT25-029");
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map((card) => card.cardId)).toContain("BT25-027");
  });

  it("pays the ordinary black evolution cost from a non-Gaogamon level-5 host", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT11-071", as: "blackBase" }], hand: [{ card: "BT25-029", as: "mirage" }] },
    });
    await s.ready();
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("blackBase").permanentId,
        instanceId: s.inst("mirage").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("blackBase").topCard.cardId === "BT25-029");
    expect(s.state.memory).toBe(0);
    expect(s.perm("blackBase").stack.map((card) => card.cardId)).toContain("BT11-071");
  });

  it("reboots on the opponent turn and blocks a public attack", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-029", as: "mirage", suspended: true }], security: ["BT1-001"] },
      1: { battleArea: [{ card: "BT1-009", as: "attacker" }], deck: ["BT1-002", "BT1-003"] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("mirage").isSuspended).toBe(false);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).blockingSeat() === 0);
    expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("mirage").permanentId })).toEqual(
      { ok: true },
    );
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.security).toHaveLength(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
  });

  it("accepts and declines Evade through real effect deletion", async () => {
    const accepted = setupEngine({ 0: { battleArea: [{ card: "BT25-029", as: "mirage" }] } });
    const deletion = advance(accepted.engine).verb.deletePermanent([accepted.perm("mirage").permanentId], "byEffect");
    await settle(() => accepted.events.some((event) => event.kind === "evadePrompt"));
    expect(
      accepted.engine.applyIntent(0, {
        type: "respondEvade",
        permanentId: accepted.perm("mirage").permanentId,
        accept: true,
      }),
    ).toEqual({ ok: true });
    expect(await deletion).toBe(0);
    expect(accepted.perm("mirage").isSuspended).toBe(true);

    const declined = setupEngine({ 0: { battleArea: [{ card: "BT25-029", as: "mirage" }] } });
    const rejected = advance(declined.engine).verb.deletePermanent([declined.perm("mirage").permanentId], "byEffect");
    await settle(() => declined.events.some((event) => event.kind === "evadePrompt"));
    expect(
      declined.engine.applyIntent(0, {
        type: "respondEvade",
        permanentId: declined.perm("mirage").permanentId,
        accept: false,
      }),
    ).toEqual({ ok: true });
    expect(await rejected).toBe(1);
  });

  it("accepts the official broader Gaogamon-name alternate and rejects a near-match", async () => {
    const legal = setupEngine({
      0: { battleArea: [{ card: "BT5-068", as: "blackMach" }], hand: [{ card: "BT25-029", as: "mirage" }] },
    });
    await legal.ready();
    legal.state.memory = 5;
    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("blackMach").permanentId,
        instanceId: legal.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => legal.perm("blackMach").topCard.cardId === "BT25-029");
    expect(legal.perm("blackMach").stack.map((card) => card.cardId)).toContain("BT5-068");
    expect(legal.state.memory).toBe(2);

    const invalid = setupEngine({
      0: { battleArea: [{ card: "BT25-026", as: "nearMatch" }], hand: [{ card: "BT25-029", as: "mirage" }] },
    });
    await invalid.ready();
    invalid.state.memory = 5;
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("nearMatch").permanentId,
        instanceId: invalid.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects an off-color non-Gaogamon, non-DATA SQUAD level-5 source on both routes", async () => {
    const alternate = setupEngine({
      0: { battleArea: [{ card: "BT25-055", as: "greenBase" }], hand: [{ card: "BT25-029", as: "mirage" }] },
    });
    await alternate.ready();
    alternate.state.memory = 4;
    expect(
      alternate.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: alternate.perm("greenBase").permanentId,
        instanceId: alternate.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toMatchObject({ ok: false });

    const ordinary = setupEngine({
      0: { battleArea: [{ card: "BT25-055", as: "greenBase" }], hand: [{ card: "BT25-029", as: "mirage" }] },
    });
    await ordinary.ready();
    ordinary.state.memory = 4;
    expect(
      ordinary.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: ordinary.perm("greenBase").permanentId,
        instanceId: ordinary.inst("mirage").instanceId,
      }),
    ).toMatchObject({ ok: false });
  });

  it("pays the DATA SQUAD alternate from a non-Gaogamon legal source", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT26-076", as: "purpleBase" }], hand: [{ card: "BT25-029", as: "mirage" }] },
    });
    await s.ready();
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("purpleBase").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("purpleBase").topCard.cardId === "BT25-029");
    expect(s.state.memory).toBe(0);
    expect(s.perm("purpleBase").stack.map((card) => card.cardId)).toContain("BT26-076");
  });

  it("returns level 5 but excludes level 6 from the first return boundary", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-029", as: "mirage" }],
        },
        1: {
          battleArea: [
            { card: "BT1-020", as: "level5" },
            { card: "BT1-025", as: "level6" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const activation = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: activation.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const paidReturn = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: paidReturn.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("level5").instanceId }),
    );
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard?.instanceId)).toContain(s.inst("level6").instanceId);
    expect(s.state.players[0]!.trash).not.toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("naturally pays the mandatory follow-up cost after a digivolution return sequence", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-029", as: "mirage" }],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "firstTarget" },
            { card: "BT1-009", as: "secondTarget" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT25-029" &&
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("firstTarget").instanceId) &&
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("secondTarget").instanceId) &&
        s.state.pendingDecision === undefined &&
        s.perm("tamer").stack.length === 0,
    );
    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("firstTarget").instanceId, s.inst("secondTarget").instanceId]),
    );
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
    expect(s.state.memory).toBe(0);
    const activation = s.decisions.find(
      ({ req }) => req.sourceCardId === "BT25-029" && req.options?.activationConfirmation === true,
    );
    expect(activation?.req.options?.effectTextEmphasis).toBe(
      "[When Digivolving] [When Attacking] [Once Per Turn] You may return 1 of your opponent's level 5 or lower Digimon to the hand.",
    );
    expect(activation?.req.options?.effectText).toContain(
      "Then, by trashing the bottom face-down card under any of your Tamers",
    );
    expect(
      s.decisions
        .filter(
          ({ req }) => (req.kind === "optional" || req.kind === "chooseTargets") && req.sourceCardId === "BT25-029",
        )
        .map(({ req }) => req.options?.effectTextPart),
    ).toEqual(
      expect.arrayContaining([
        "Then, by trashing the bottom face-down card under any of your Tamers, return 1 of your opponent's lowest level Digimon to the hand.",
        "[When Digivolving] [When Attacking] [Once Per Turn] You may return 1 of your opponent's level 5 or lower Digimon to the hand.",
      ]),
    );
  });

  it("does not pay the processing cost when the follow-up is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-029", as: "mirage" }],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "firstTarget" },
            { card: "BT1-009", as: "secondTarget" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const firstDecision = s.state.pendingDecision!;
    expect(firstDecision.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: firstDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.decisionId !== firstDecision.decisionId,
    );
    const costDecision = s.state.pendingDecision!;
    expect(costDecision.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: costDecision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT25-029" &&
        s.state.pendingDecision === undefined &&
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("firstTarget").instanceId),
    );
    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("firstTarget").instanceId }),
    );
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard?.instanceId)).toContain(
      s.inst("secondTarget").instanceId,
    );
    expect(s.perm("tamer").stack).toHaveLength(1);
    expect(s.state.players[0]!.trash).not.toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("unsuspends from the Tamer-trash watcher when the return cost is accepted", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-029", as: "mirage" }],
        },
        1: { battleArea: [{ card: "BT1-025", as: "highTarget" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.perm("tamer").stack.length === 0);
    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("allows the shared effect to activate on an attack after both evolution prompts were declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-027", as: "base", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "cost", faceUp: false }] },
          ],
          hand: [{ card: "BT25-029", as: "mirage" }],
        },
        1: {
          security: ["BT1-001"],
          battleArea: [
            { card: "BT1-010", as: "firstTarget" },
            { card: "BT1-009", as: "secondTarget" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const firstDecline = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: firstDecline.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.perm("base").topCard.cardId === "BT25-029");
    await advance(s.engine).verb.unsuspend([s.perm("base").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(s.state.pendingDecision?.kind).toBe("optional");
    const attackActivation = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: attackActivation.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const attackReturn = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: attackReturn.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const attackCost = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: attackCost.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.hand).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("firstTarget").instanceId }),
    );
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("cost").instanceId }),
    );
  });

  it("keeps both All Turns unsuspend watchers once per turn", () => {
    const effect = BT25_029.effects?.find((entry) => entry.trigger === "AllTurns");
    expect(effect?.frequency).toBe("OncePerTurn");
    expect(effect?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "SubTrigger", event: "whenEffectAddsToOpponentHand", optional: true }),
        expect.objectContaining({
          kind: "SubTrigger",
          event: "whenDigivolutionTrashed",
          optional: true,
          sourceFilter: { controller: "mine", kind: ["Tamer"] },
        }),
      ]),
    );
  });

  it("unsuspends from opponent-hand addition once, suppresses a second event, and rejects the wrong controller", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT25-029", as: "mirage", suspended: true }] }, 1: {} },
      { autoAcceptOptional: true },
    );
    await s.ready();
    await advance(s.engine).fireSubTrigger("whenEffectAddsToOpponentHand", { effectAddedToHandSeat: 1 });
    expect(s.perm("mirage").isSuspended).toBe(false);
    await advance(s.engine).verb.suspend([s.perm("mirage").permanentId]);
    await advance(s.engine).fireSubTrigger("whenEffectAddsToOpponentHand", { effectAddedToHandSeat: 1 });
    expect(s.perm("mirage").isSuspended).toBe(true);

    const wrong = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-029", as: "mirage", suspended: true }] },
        1: { battleArea: [{ card: "BT1-085", as: "opponentTamer", under: [{ card: "BT1-001", as: "source" }] }] },
      },
      { autoAcceptOptional: true },
    );
    await wrong.ready();
    await advance(wrong.engine).verb.trashDigivolutionCards(
      wrong.perm("opponentTamer").permanentId,
      [wrong.inst("source").instanceId],
      0,
    );
    expect(wrong.state.players[1]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: wrong.inst("source").instanceId }),
    );
    expect(wrong.perm("mirage").isSuspended).toBe(true);
  });

  it("does not treat an ordinary draw as an opponent-hand effect", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-029", as: "mirage", suspended: true }] },
      1: { deck: ["BT1-001", "BT1-002"] },
    });
    await s.ready();
    await advance(s.engine).verb.draw(1, 1);
    expect(s.perm("mirage").isSuspended).toBe(true);
    expect(s.state.players[1]!.hand).toHaveLength(1);
  });

  it("shares one watcher use across the two event types and preserves a later use after refusal", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-029", as: "mirage", suspended: true },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-001", as: "source", faceUp: false }] },
          ],
        },
        1: {},
      },
      { autoAcceptOptional: true },
    );
    await s.ready();
    await advance(s.engine).fireSubTrigger("whenEffectAddsToOpponentHand", { effectAddedToHandSeat: 1 });
    expect(s.perm("mirage").isSuspended).toBe(false);
    await advance(s.engine).verb.suspend([s.perm("mirage").permanentId]);
    await advance(s.engine).verb.trashDigivolutionCards(s.perm("tamer").permanentId, [s.inst("source").instanceId], 0);
    expect(s.perm("mirage").isSuspended).toBe(true);

    const refused = setupEngine(
      { 0: { battleArea: [{ card: "BT25-029", as: "mirage", suspended: true }] }, 1: {} },
      { autoAcceptOptional: false },
    );
    await refused.ready();
    const firing = advance(refused.engine).fireSubTrigger("whenEffectAddsToOpponentHand", { effectAddedToHandSeat: 1 });
    await settle(() => refused.state.pendingDecision?.kind === "optional");
    const decline = refused.state.pendingDecision!;
    expect(
      refused.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decline.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await firing;
    expect(refused.perm("mirage").isSuspended).toBe(true);
    const secondFiring = advance(refused.engine).fireSubTrigger("whenEffectAddsToOpponentHand", {
      effectAddedToHandSeat: 1,
    });
    await settle(() => refused.state.pendingDecision?.kind === "optional");
    const accept = refused.state.pendingDecision!;
    expect(
      refused.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: accept.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await secondFiring;
    expect(refused.perm("mirage").isSuspended).toBe(false);
    await settle(() => !refused.perm("mirage").isSuspended && refused.state.pendingDecision === undefined);
  });
});

describe("BT25-029 MirageGaogamon — KB Q&A rulings", () => {
  it("still activates the shared effect on a same-turn attack after declining it when digivolving (Q6296)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-027", as: "base" }],
          hand: [{ card: "BT25-029", as: "mirage" }],
        },
        1: { security: ["BT1-001"], battleArea: [{ card: "BT1-020", as: "levelFive" }] },
      },
      { autoSelectCards: true },
    );
    const answerOptional = async (accept: boolean) => {
      await settle(() => s.state.pendingDecision?.kind === "optional");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
    };
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("mirage").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await answerOptional(false);
    await settle(() => s.state.pendingDecision === undefined && s.perm("base").topCard.cardId === "BT25-029");
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("levelFive").permanentId,
    ]);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await answerOptional(true);
    await answerOptional(true);
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("levelFive").instanceId);
  });
});
