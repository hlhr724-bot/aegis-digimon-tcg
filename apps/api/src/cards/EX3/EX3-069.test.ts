import { EffectDuration, getCardDefinition, getCompiledCard, Phase, Zone } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle, settleAcrossTimers } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./EX3-025.js";
import "./EX3-069.js";
import "./EX3-074.js";
import "../P/P-143.js";

interface ActivatableEntry {
  instanceId: string;
  effectKey: string;
  description: string;
}

function delayEntry(permanent: { activatableEffectsJson?: string }): ActivatableEntry | undefined {
  const entries = JSON.parse(permanent.activatableEffectsJson || "[]") as ActivatableEntry[];
  return entries.find(({ description }) => /Delay/i.test(description));
}

describe("EX3-069 Trial of the Four Great Dragons", () => {
  it("matches the official identity, Four Great Dragons trait, errata, and Security text", () => {
    const definition = getCardDefinition("EX3-069")!;
    expect(definition).toMatchObject({
      cardId: "EX3-069",
      nameEn: "Trial of the Four Great Dragons",
      colors: ["Yellow"],
      kinds: ["Option"],
      playCost: 8,
      types: ["Four Great Dragons"],
      rarity: "R",
      maxCountInDeck: 4,
      imageId: "EX3-069",
    });
    expect(definition.effectText).toBe(
      "[Main] ＜Draw 1＞. Then, place this card in your battle area.[Main] ＜Delay＞ (By trashing this card in your battle area, activate the effect below. You can't activate this effect the turn this card enters play.)・Play 1 Digimon card with [Four Great Dragons] in its traits from your hand without paying the cost. The Digimon played by this effect can't digivolve to level 7, and at the next end of your opponent's turn, delete that Digimon.",
    );
    expect(definition.securityEffectText).toBe("[Security] Place this card in its owner's battle area.");
    expect(getCompiledCard("EX3-069")).toMatchObject({ coverage: "full", residual: [] });
  });

  it("Main draws exactly 1, pays 8 memory, and places Trial instead of trashing it", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-034", as: "yellowSource" }],
        hand: [{ card: "EX3-069", as: "trial" }],
        deck: [
          { card: "BT1-009", as: "drawn" },
          { card: "BT1-010", as: "remaining" },
        ],
      },
    });
    s.state.memory = 8;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("trial").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069"));

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("drawn").instanceId);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([s.inst("remaining").instanceId]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).not.toContain("EX3-069");
    assertNoLoudGap(s);
  });

  it("does not satisfy its yellow color requirement from Trial itself or without a yellow Digimon/Tamer", async () => {
    const withoutSource = setupEngine({ 0: { hand: [{ card: "EX3-069", as: "trial" }] } });
    withoutSource.state.memory = 8;
    await withoutSource.ready();
    expect(
      withoutSource.engine.applyIntent(0, {
        type: "playCard",
        instanceId: withoutSource.inst("trial").instanceId,
      }),
    ).toEqual({ ok: false, reason: "color-requirement-unmet" });

    const optionOnly = setupEngine({
      0: {
        battleArea: [{ card: "EX3-069", as: "placedTrial" }],
        hand: [{ card: "EX3-068", as: "godFlame" }],
      },
    });
    optionOnly.state.memory = 5;
    await optionOnly.ready();
    expect(
      optionOnly.engine.applyIntent(0, {
        type: "playCard",
        instanceId: optionOnly.inst("godFlame").instanceId,
      }),
    ).toEqual({ ok: false, reason: "color-requirement-unmet" });
  });

  it("Security places Trial without drawing, paying memory, or activating Main", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-028", as: "attacker" }], security: ["BT1-009"] },
      1: { security: [{ card: "EX3-069", as: "securityTrial" }] },
    });
    s.state.turnSeat = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069"));

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain("EX3-069");
    expect(s.state.players[1]!.security).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("does not expose Delay on the entry turn and exposes it on a later turn", async () => {
    const s = setupEngine({ 0: { hand: [{ card: "EX3-069", as: "trial" }] } });
    await s.ready();
    await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trial").instanceId);
    const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-069")!;

    expect(delayEntry(trial)).toBeUndefined();

    s.state.turnCount += 1;
    await advance(s.engine).recompute();
    expect(delayEntry(trial)).toBeDefined();
    assertNoLoudGap(s);
  });

  it("Four Great Dragons family: Delay shows only eligible Digimon, plays one free, and trashes Trial", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "EX3-069", as: "trial" },
          { card: "EX3-025", as: "azulongmon" },
          { card: "EX3-036", as: "magnadramon" },
          { card: "BT1-010", as: "unrelated" },
        ],
      },
    });
    await s.ready();
    await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trial").instanceId);
    const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-069")!;
    s.state.turnCount += 1;
    await advance(s.engine).recompute();

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trial.topCard.instanceId,
        effectKey: delayEntry(trial)!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const selection = s.decisions.at(-1)!.req;
    expect(selection).toMatchObject({
      sourceCardId: "EX3-069",
      kind: "selectCards",
      options: {
        candidateInstanceIds: [s.inst("azulongmon").instanceId, s.inst("magnadramon").instanceId],
        visibleInstanceIds: [
          s.inst("azulongmon").instanceId,
          s.inst("magnadramon").instanceId,
          s.inst("unrelated").instanceId,
        ],
        min: 0,
        max: 1,
        timing: "Main",
      },
    });
    expect(selection.options?.effectText).toContain("can't digivolve to level 7");
    expect(selection.options?.effectText).toContain("at the next end of your opponent's turn");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("azulongmon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => {
      const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-025");
      return played !== undefined && observe(s.engine).hasRestriction(played, "digivolveToLevel7" as never);
    });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX3-069"));

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("EX3-069");
    expect(s.state.memory).toBe(2);
    assertNoLoudGap(s);
  });

  it("Q3433 keeps the permanent binding after a source is added and deletes only that Digimon next opponent turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX3-069", as: "trial" },
            { card: "EX3-025", as: "azulongmon" },
            { card: "BT1-009", as: "addedSource" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          battleArea: [{ card: "BT1-010", as: "unrelatedOwn" }],
        },
        1: { deck: ["BT1-009", "BT1-010", "BT1-011"] },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("azulongmon").instanceId);
    await s.ready();
    await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trial").instanceId);
    const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-069")!;
    s.state.turnCount += 1;
    await advance(s.engine).recompute();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trial.topCard.instanceId,
        effectKey: delayEntry(trial)!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => {
      const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-025");
      return (
        played !== undefined &&
        advance(s.engine).ledgers.subTriggers.subscriptionsFor("endOfOpponentTurn", played.permanentId).length === 1
      );
    });
    const played = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("azulongmon").instanceId,
    )!;
    await advance(s.engine).verb.placeUnder(played.permanentId, [s.inst("addedSource").instanceId]);
    expect(played.stack).toHaveLength(1);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);

    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === played.permanentId)).toBe(false);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("unrelatedOwn").permanentId,
    );
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("azulongmon").instanceId, s.inst("addedSource").instanceId]),
    );
    assertNoLoudGap(s);
  });

  it("Q3434 prevents the played Digimon from normally digivolving to level 7", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX3-069", as: "trial" },
            { card: "EX3-025", as: "azulongmon" },
            { card: "BT1-084", as: "omnimon" },
          ],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("azulongmon").instanceId);
    await s.ready();
    await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trial").instanceId);
    const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-069")!;
    s.state.turnCount += 1;
    await advance(s.engine).recompute();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trial.topCard.instanceId,
        effectKey: delayEntry(trial)!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => {
      const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-025");
      return played !== undefined && observe(s.engine).hasRestriction(played, "digivolveToLevel7" as never);
    });
    s.state.phase = Phase.Main;
    s.state.memory = 10;

    const played = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("azulongmon").instanceId,
    )!;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: played.permanentId,
        instanceId: s.inst("omnimon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(observe(s.engine).hasRestriction(played, "digivolveToLevel7" as never)).toBe(true);
    assertNoLoudGap(s);
  });

  it("Q3434 also prevents DNA digivolving the played Digimon into level 7", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX3-069", as: "trial" },
            { card: "EX3-025", as: "azulongmon" },
            { card: "EX3-074", as: "examon" },
          ],
          battleArea: [{ card: "BT1-081", as: "greenLevel6" }],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("azulongmon").instanceId);
    await s.ready();
    await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trial").instanceId);
    const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-069")!;
    s.state.turnCount += 1;
    await advance(s.engine).recompute();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trial.topCard.instanceId,
        effectKey: delayEntry(trial)!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => {
      const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-025");
      return played !== undefined && observe(s.engine).hasRestriction(played, "digivolveToLevel7" as never);
    });
    s.state.phase = Phase.Main;

    const played = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("azulongmon").instanceId,
    )!;
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [played.permanentId, s.perm("greenLevel6").permanentId],
        instanceId: s.inst("examon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    assertNoLoudGap(s);
  });

  it("Q5722 attempts deletion only at the first opponent turn end while the level-7 lock persists", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX3-069", as: "trial" },
            { card: "EX3-025", as: "azulongmon" },
            { card: "BT1-084", as: "omnimon" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: { deck: ["BT1-009", "BT1-010", "BT1-011"] },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("azulongmon").instanceId);
    await s.ready();
    await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trial").instanceId);
    const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-069")!;
    s.state.turnCount += 1;
    await advance(s.engine).recompute();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trial.topCard.instanceId,
        effectKey: delayEntry(trial)!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => {
      const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-025");
      return (
        played !== undefined &&
        observe(s.engine).hasRestriction(played, "digivolveToLevel7" as never) &&
        advance(s.engine).ledgers.subTriggers.subscriptionsFor("endOfOpponentTurn", played.permanentId).length === 1
      );
    });
    const played = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("azulongmon").instanceId,
    )!;

    advance(s.engine).ledgers.continuous.addRestriction(
      played.permanentId,
      "beDeleted",
      EffectDuration.UntilOpponentTurnEnd,
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(played.permanentId);
    expect(observe(s.engine).hasRestriction(played, "beDeleted")).toBe(false);
    expect(observe(s.engine).hasRestriction(played, "digivolveToLevel7" as never)).toBe(true);

    s.state.turnSeat = 0;
    s.state.memory = 3;
    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(played.permanentId);
    s.state.turnSeat = 0;
    s.state.phase = Phase.Main;
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: played.permanentId,
        instanceId: s.inst("omnimon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    assertNoLoudGap(s);
  });
});

describe("EX3-069 Trial of the Four Great Dragons — KB Q&A rulings", () => {
  it.each([["deletion first"], ["end-of-turn effect first"]] as const)(
    "lets the turn player order the Delay deletion against an end-of-turn effect: %s (Q5723)",
    async (order) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            hand: [
              { card: "EX3-069", as: "trial" },
              { card: "EX3-025", as: "azulongmon" },
            ],
            deck: ["BT1-009", "BT1-010", "BT1-011"],
          },
          1: { battleArea: [{ card: "P-143", as: "drimogemon" }], deck: ["BT1-009", "BT1-010", "BT1-011"] },
        },
        { autoSelectCards: true, autoAcceptOptional: true, autoOrderTriggers: false, preferInstanceIds: preferred },
      );
      preferred.push(s.inst("azulongmon").instanceId);
      await s.ready();
      await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trial").instanceId);
      const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX3-069")!;
      s.state.turnCount += 1;
      await advance(s.engine).recompute();
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: trial.topCard.instanceId,
          effectKey: delayEntry(trial)!.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-025"));
      const azulongmonId = s.inst("azulongmon").instanceId;

      s.state.turnSeat = 1;
      s.state.memory = 3;
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(1);
      advance(s.engine).endMainPhaseIfOpen(1);
      await settleAcrossTimers(() => s.state.pendingDecision?.kind === "orderTriggers");

      const ordering = s.state.pendingDecision!;
      expect(ordering.seat).toBe(1);
      const keys = (JSON.parse(ordering.payloadJson) as { triggerKeys?: string[] }).triggerKeys ?? [];
      expect(keys).toHaveLength(2);
      const deletionKey = keys.find((key) => /delete that Digimon/i.test(key))!;
      const drimogemonKey = keys.find((key) => key !== deletionKey)!;
      expect(deletionKey).toBeDefined();
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: ordering.decisionId,
          response: { kind: "orderTriggers", order: [order === "deletion first" ? deletionKey : drimogemonKey] },
        }),
      ).toEqual({ ok: true });
      await turn;

      const deletedAt = s.events.findIndex(
        (event) => event.kind === "cardsMoved" && event.to === Zone.Trash && event.instanceIds.includes(azulongmonId),
      );
      const movedAt = s.events.findIndex((event) => event.kind === "effectResolved" && event.sourceCardId === "P-143");
      expect(deletedAt).toBeGreaterThanOrEqual(0);
      expect(movedAt).toBeGreaterThanOrEqual(0);
      expect(deletedAt < movedAt).toBe(order === "deletion first");
      expect(s.state.players[1]!.breeding?.topCard.instanceId).toBe(s.inst("drimogemon").instanceId);
    },
  );
});
