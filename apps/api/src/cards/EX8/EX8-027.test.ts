import { describe, expect, it } from "vitest";
import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine } from "../../engine/testkit/harness.js";
import "./index.js";
import { compiled } from "./EX8-027.js";

describe("EX8-027", () => {
  it("matches committed catalog identity and every printed text field", () => {
    expect(getCardDefinition("EX8-027")).toMatchObject({
      cardId: "EX8-027",
      nameEn: "Plesiomon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [{ color: "Blue", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Data"],
      types: ["Plesiosaur", "DS"],
      effectText: expect.stringContaining("2 of your Digimon may DNA digivolve"),
    });
    expect(getCardDefinition("EX8-027")?.inheritedEffectText).toBeUndefined();
  });

  it("plays a level 4 or lower Digimon from its digivolution cards when digivolving", () =>
    expect(compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving")?.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      from: ["digivolutionCards"],
      fromOwnDigivolutionStack: true,
      payCost: false,
      optional: true,
      target: { count: 1 },
    }));
  it("can DNA digivolve into DS and attack after another DS Digimon is played or digivolves", () => {
    const actions = compiled.effects?.find((entry) => entry.trigger === "YourTurn")?.actions ?? [];
    expect(actions).toHaveLength(2);
    expect(compiled.effects?.find((entry) => entry.trigger === "YourTurn")).toMatchObject({ frequency: "OncePerTurn" });
    expect(actions[0]).toMatchObject({
      kind: "SubTrigger",
      actions: [{ kind: "DnaDigivolve" }, { kind: "Attack", optional: true }],
    });
    expect(actions[1]).toMatchObject({ kind: "SubTrigger", event: "whenOneOfYoursDigivolves" });
  });
  it("registers the live Plesiomon permanent with its DS trait", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "EX8-027", as: "plesiomon" }] } });
    await s.ready();
    expect(observe(s.engine).hasEffectiveTrait(s.perm("plesiomon"), "DS")).toBe(true);
  });

  it("plays one level-4-or-lower card only from its own stack when digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX8-025", as: "whamon", under: [{ card: "EX8-020", as: "own" }] },
            { card: "BT8-030", as: "other", under: [{ card: "EX8-025", as: "foreign" }] },
          ],
          hand: [{ card: "EX8-027", as: "plesiomon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("whamon").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("own").instanceId),
    );

    expect(s.perm("other").stack.some((card) => card.instanceId === s.inst("foreign").instanceId)).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("keeps the optional source playback declined during digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-025", as: "whamon", under: [{ card: "EX8-020", as: "own" }] }],
          hand: [{ card: "EX8-027", as: "plesiomon" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("whamon").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("whamon").topCard.cardId === "EX8-027");

    expect(s.perm("whamon").stack).toHaveLength(2);
    expect(s.perm("whamon").topCard.cardId).toBe("EX8-027");
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("does not react to a played non-DS Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-027", as: "plesiomon" }],
          hand: [
            { card: "BT1-009", as: "nonDs" },
            { card: "EX8-029", as: "aegis" },
          ],
        },
        1: { security: 1 },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nonDs").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined);

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("nonDs").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("aegis").instanceId)).toBe(true);
  });

  it("triggers from Plesiomon's own play, DNA digivolves into DS, and attacks (Q3894)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-026", as: "metal" }],
          hand: [
            { card: "EX8-027", as: "plesiomon" },
            { card: "EX8-029", as: "aegis" },
          ],
        },
        1: { security: 1 },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("plesiomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 0);

    const dna = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("aegis").instanceId,
    );
    expect(dna).toBeDefined();
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "EX8-027")
        .map(({ req }) => req.options?.effectTextPart),
    ).toEqual([
      "[Your Turn] [Once Per Turn] When any of your Digimon are played or digivolve, if any of them have the [DS] trait, " +
        "2 of your Digimon may DNA digivolve into a Digimon card with the [DS] trait in the hand.",
      "Then, that DNA digivolved Digimon may attack.",
    ]);
  });

  it("#5258 keeps attacking optional after accepting DNA in the trigger resolution plan", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX8-027", as: "first" },
            { card: "EX8-026", as: "metal" },
            { card: "EX8-027", as: "second" },
          ],
          hand: [
            { card: "EX8-021", as: "played" },
            { card: "EX8-029", as: "aegis" },
          ],
        },
        1: { security: ["BT1-009", "BT1-010", "BT1-011"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderTriggers: false,
        declinePrompts: ["Attack with a Digimon"],
      },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.state.pendingDecision!;
    const keys: string[] = JSON.parse(request.payloadJson).triggerKeys;
    expect(keys).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderTriggers", order: keys, optionalAnswers: { [keys[0]!]: true, [keys[1]!]: false } },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "EX8-029") && !s.state.pendingDecision,
    );
    const optionalAttack = s.decisions.filter(
      ({ req }) =>
        req.kind === "optional" && req.sourceCardId === "EX8-027" && req.options?.selectionContext === "attackSource",
    );
    expect(optionalAttack).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.events.some((e) => e.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "EX8-029")?.isSuspended).toBe(false);
  });

  it("triggers from Plesiomon's own digivolution and exposes the exact DS route (Q3895)", async () => {
    expect(digivolutionRequirementsFor("EX8-027")).toContainEqual({
      level: 5,
      traits: ["DS"],
      cost: 3,
      isAlternate: true,
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX8-025", as: "whamon" },
            { card: "EX8-026", as: "metal" },
          ],
          hand: [
            { card: "EX8-027", as: "plesiomon" },
            { card: "EX8-029", as: "aegis" },
          ],
        },
        1: { security: 1 },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("whamon").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("aegis").instanceId),
    ).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("accepts the standard Blue level-5 evolution route at cost 3", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX8-024", as: "base" }], hand: [{ card: "EX8-027", as: "plesiomon" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("plesiomon").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack).toHaveLength(1);
  });

  it("offers an order decision when two Plesiomon watchers trigger together (Q3896)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX8-027", as: "first" },
            { card: "EX8-027", as: "second" },
            { card: "EX8-020", as: "base" },
          ],
          hand: [
            { card: "EX8-024", as: "evolver" },
            { card: "EX8-029", as: "aegis" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolver").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");

    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")?.req;
    // The evolving EX8-024's printed When Digivolving effect is simultaneous with
    // both already-present Plesiomon watchers and belongs in the same order choice.
    expect(request?.options?.triggerCardIds).toEqual(["EX8-024", "EX8-027", "EX8-027"]);
    const firstKey = request?.options?.triggerKeys?.[0];
    expect(firstKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request!.decisionId,
        response: { kind: "orderTriggers", order: [firstKey!] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
  });

  it("reopens the optional DNA watcher after a new turn while refusing it twice in one turn", async () => {
    const neutralDeck = Array.from({ length: 10 }, () => "BT1-009");
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX8-027", as: "plesiomon" },
            { card: "EX8-026", as: "metal" },
          ],
          hand: [
            { card: "EX8-029", as: "aegis" },
            { card: "EX8-017", as: "first" },
            { card: "EX8-017", as: "second" },
            { card: "EX8-017", as: "third" },
          ],
          deck: neutralDeck,
        },
        1: { security: 5, deck: neutralDeck },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    const declineOptional = async (): Promise<void> => {
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const { decisionId } = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined);
    };

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({ ok: true });
    await declineOptional();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("first").instanceId)).toBe(true);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    // The clause is wholly optional ("2 of your Digimon may DNA digivolve"), so the first
    // refusal never activated it and its [Once Per Turn] use is still available (CR 15-6-3,
    // KB Q1818). The second play therefore offers the watcher again, and refusing it once
    // more likewise leaves the use unspent.
    await declineOptional();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("second").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("aegis").instanceId)).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("third").instanceId })).toEqual({ ok: true });
    await declineOptional();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("third").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("aegis").instanceId)).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });
});
