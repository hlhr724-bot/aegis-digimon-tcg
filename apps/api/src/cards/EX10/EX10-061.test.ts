import { EffectTiming, getCardDefinition, type CardInstance } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { effectsOf } from "../../engine/effects/collect.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX10-061.js";
import "../index.js";

const CARD_ID = "EX10-061";

const COLOR_GUARD = [
  { card: "BT1-038", faceUp: true },
  { card: "BT1-080", faceUp: true },
];

function reducedCostPlayEffectKey(s: EngineSetup, instance: CardInstance, cardId: string): string {
  const found = effectsOf(EffectTiming.OnDeclaration, observe(s.engine).cardSource(instance)).find(({ effectKey }) =>
    effectKey.startsWith(`${cardId}/`),
  );
  if (found === undefined) throw new Error(`${cardId} surfaces no [Hand][Main] activated effect`);
  return found.effectKey;
}

const FILLER_DECK = ["BT1-013", "BT1-014", "BT1-009", "BT1-012", "BT1-013", "BT1-014"];

describe("EX10-061 Apocalymon — catalog and IR", () => {
  it("records the exact catalog, alternate evolution, and complete contract", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      colors: ["White"],
      level: 7,
      playCost: 17,
      dp: 16000,
      evoCosts: [],
      forms: ["Mega"],
      attributes: ["Unknown"],
      types: ["Unidentified"],
    });
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      digivolutionRequirement: [{ level: 6, traits: ["Dark Masters"], cost: 5, isAlternate: true }],
    });
    expect(compiled.effects?.find(({ trigger }) => trigger === "Static")).toMatchObject({
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          cost: {
            kind: "place",
            optional: true,
            target: { filter: { zone: "security", faceUp: true }, count: "all", distinctNames: true },
          },
          actions: [{ kind: "Replacement", mode: "reduceCost", amountPerPlaced: 4 }],
        },
      ],
    });
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      expect(compiled.effects?.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "PlayWithoutCost",
            payCost: false,
            optional: true,
            from: ["digivolutionCards"],
            target: { count: "all", distinctNames: true },
          },
          { kind: "GainKeyword", keyword: { keyword: "Rush" }, duration: "forTheTurn", target: { count: "all" } },
          { kind: "DelayedDelete" },
        ],
      });
    }
  });
});

describe("EX10-061 Apocalymon — [When this card would be played] cost reduction", () => {
  it("resolves security removal after Apocalymon's On Play has played its Dark Masters", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "apocalymon" }],
          deck: FILLER_DECK,
          security: [
            { card: "EX10-012", as: "metal", faceUp: true },
            { card: "EX10-020", as: "puppet", faceUp: true },
            { card: "EX10-035", as: "machinedramon", faceUp: true },
            "BT1-009",
          ],
        },
        1: { battleArea: [{ card: "BT20-018", as: "ouryumon" }], deck: FILLER_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT20-018"));
    await settle(() => s.state.pendingDecision === undefined);

    const apocalymonResolved = s.events.findIndex(
      (event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID && event.timing === "OnPlay",
    );
    const ouryumonTriggered = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT20-018",
    );
    expect(apocalymonResolved).toBeGreaterThanOrEqual(0);
    expect(ouryumonTriggered).toBeGreaterThan(apocalymonResolved);
    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain(CARD_ID);
    expect(
      s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT20-018"),
    ).toHaveLength(1);
  });

  it("lets the turn player resolve a security-removal watcher before Apocalymon's On Play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "apocalymon" }],
          battleArea: [{ card: "BT20-018", as: "ouryumon" }],
          deck: FILLER_DECK,
          security: [
            { card: "EX10-012", as: "metal", faceUp: true },
            { card: "EX10-020", as: "puppet", faceUp: true },
            { card: "EX10-035", as: "machinedramon", faceUp: true },
            "BT1-009",
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "victim" }], deck: FILLER_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferTriggerKeys: ["BT20-018"] },
    );
    await s.ready();
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.events.some(
        (event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID && event.timing === "OnPlay",
      ),
    );
    await settle(() => s.state.pendingDecision === undefined);
    const watcherResolved = s.events.findIndex(
      (event) => event.kind === "effectResolved" && event.sourceCardId === "BT20-018",
    );
    const onPlayActivated = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID && event.timing === "OnPlay",
    );
    expect(watcherResolved).toBeGreaterThanOrEqual(0);
    expect(onPlayActivated).toBeGreaterThan(watcherResolved);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(5);
    expect(
      s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT20-018"),
    ).toHaveLength(1);
    expect(
      s.decisions.some(
        ({ req }) =>
          req.kind === "orderTriggers" &&
          req.options?.triggerCardIds?.includes(CARD_ID) &&
          req.options.triggerCardIds.includes("BT20-018"),
      ),
    ).toBe(true);
  });

  it("Q5783/Q5785/Q5741: places the single face-up card, pays 13, plays it out, deletes it at turn end", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "apocalymon" }, "BT1-013"],
          deck: FILLER_DECK,
          security: [
            { card: "EX10-012", as: "metal", faceUp: true },
            { card: "BT1-009", as: "faceDown" },
            ...COLOR_GUARD,
          ],
        },
        1: { deck: FILLER_DECK, security: ["BT1-009", "BT1-014"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 13;
    const securityBefore = s.state.players[0]!.security.length;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.security).toHaveLength(securityBefore - 1);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).not.toContain(s.inst("metal").instanceId);

    const apocalymon = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === CARD_ID)!;
    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX10-012")!;
    expect(apocalymon.stack).toHaveLength(0);
    expect(played.stack).toHaveLength(0);
    expect(observe(s.engine).hasKeyword(played, "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(apocalymon, "Rush")).toBe(false);

    const playedId = played.permanentId;
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([apocalymon.permanentId]);
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === playedId)).toBe(false);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("EX10-012");

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("Q5784/Q5786: places one of EACH distinct name, pays 9, and never offers a smaller subset", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "apocalymon" }],
          deck: FILLER_DECK,
          security: [
            { card: "EX10-012", as: "metal", faceUp: true },
            { card: "BT15-031", as: "duplicateMetal", faceUp: true },
            { card: "EX10-020", as: "puppet", faceUp: true },
            { card: "BT1-009", as: "faceDown" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);

    expect(s.state.memory).toBe(-9);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual([
      "EX10-012",
      "EX10-020",
      CARD_ID,
    ]);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("duplicateMetal").instanceId,
      s.inst("faceDown").instanceId,
    ]);
    expect(s.perm("apocalymon").stack).toHaveLength(0);

    const selections = s.decisions.filter(({ req }) => req.kind === "selectCards");
    expect(selections.length).toBeGreaterThan(0);
    expect(selections.every(({ req }) => req.options?.min === 1 && req.options?.max === 1)).toBe(true);
  });

  it("Q5784/Q5786: declining the optional cost places nothing and pays the full 17", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "apocalymon" }],
          deck: FILLER_DECK,
          security: [
            { card: "EX10-012", as: "metal", faceUp: true },
            { card: "EX10-020", as: "puppet", faceUp: true },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);

    expect(s.state.memory).toBe(-10);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([CARD_ID]);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("metal").instanceId,
      s.inst("puppet").instanceId,
    ]);
    expect(s.perm("apocalymon").stack).toHaveLength(0);
  });
});

describe("EX10-061 Apocalymon — [When Digivolving] through the real evolution route", () => {
  it("digivolves from a Lv.6 [Dark Masters] host for 5, refuses a non-[Dark Masters] Lv.6", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX10-012", as: "host" },
            { card: "EX10-020", as: "resident" },
            { card: "BT1-009", as: "plain" },
            { card: "BT2-064", as: "wrongHost" },
          ],
          hand: [{ card: CARD_ID, as: "apocalymon" }, "BT1-013"],
          deck: FILLER_DECK,
          security: [{ card: "BT1-009", as: "faceDown" }, ...COLOR_GUARD],
        },
        1: { deck: FILLER_DECK, security: ["BT1-009", "BT1-014"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wrongHost").permanentId,
        instanceId: s.inst("apocalymon").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.perm("wrongHost").topCard.cardId).toBe("BT2-064");
    expect(s.state.memory).toBe(5);

    const hostId = s.perm("host").permanentId;
    const deckBefore = s.state.players[0]!.deck.length;
    const handBefore = s.state.players[0]!.hand.length;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: hostId,
        instanceId: s.inst("apocalymon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 5);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.deck).toHaveLength(deckBefore - 1);
    expect(s.state.players[0]!.hand).toHaveLength(handBefore);
    expect(s.perm("host").topCard.cardId).toBe(CARD_ID);
    expect(s.perm("host").stack).toHaveLength(0);
    const played = s.state.players[0]!.battleArea.find(
      ({ permanentId, topCard }) => permanentId !== hostId && topCard.cardId === "EX10-012",
    )!;
    expect(played).toBeDefined();

    const seen = observe(s.engine);
    expect(seen.hasKeyword(played, "Rush")).toBe(true);
    expect(seen.hasKeyword(s.perm("resident"), "Rush")).toBe(true);
    // CR 15-11-2-2: a Digimon that enters afterwards gains it too.
    const lateKeywordEntrant0 = s.putOnBoard(0, "EX10-020");
    expect(observe(s.engine).hasKeyword(lateKeywordEntrant0, "Rush")).toBe(true);
    expect(seen.hasKeyword(s.perm("plain"), "Rush")).toBe(false);
    expect(seen.hasKeyword(s.perm("host"), "Rush")).toBe(false);

    const playedId = played.permanentId;
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual([
      "BT1-009",
      "BT2-064",
      "EX10-020",
      "EX10-020",
      CARD_ID,
    ]);
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === playedId)).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("resident"), "Rush")).toBe(false);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("EX10-061 Apocalymon — end-of-turn processing", () => {
  it("Q5741/Q5742: its delete is simultaneous with another end-of-turn processing, ordered by the turn player", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX10-020", as: "puppet" }, { card: CARD_ID, as: "apocalymon" }, "BT1-013"],
          deck: FILLER_DECK,
          security: [
            { card: "EX10-012", as: "metal", faceUp: true },
            { card: "BT1-009", as: "faceDown" },
            ...COLOR_GUARD,
          ],
        },
        1: { deck: FILLER_DECK, security: ["BT1-009", "BT1-014"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    s.state.memory = 6;
    const puppetInstanceId = s.inst("puppet").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: puppetInstanceId,
        effectKey: reducedCostPlayEffectKey(s, s.inst("puppet"), "EX10-020"),
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX10-020"));
    expect(s.state.memory).toBe(0);

    s.state.memory = 13;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual([
      "EX10-012",
      "EX10-020",
      CARD_ID,
    ]);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([CARD_ID]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["EX10-012", "EX10-020"]),
    );

    const orderPrompts = s.decisions.filter(({ req }) => req.kind === "orderTriggers");
    expect(orderPrompts.length).toBeGreaterThan(0);
    expect(orderPrompts.every(({ seat }) => seat === 0)).toBe(true);
    expect(orderPrompts.some(({ req }) => (req.options?.triggerKeys ?? []).length > 1)).toBe(true);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
