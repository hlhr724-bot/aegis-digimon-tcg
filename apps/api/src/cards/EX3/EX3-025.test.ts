import { getCardDefinition, type DecisionResponse } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { compiled } from "./EX3-025.js";
import "./EX3-069.js";

interface ActivatableEntry {
  effectKey: string;
}

function delayEntry(permanent: { activatableEffectsJson?: string }): ActivatableEntry | undefined {
  const entries = JSON.parse(permanent.activatableEffectsJson || "[]") as (ActivatableEntry & {
    description: string;
  })[];
  return entries.find(({ description }) => /Delay/i.test(description));
}

function payload(decision: { payloadJson: string }) {
  return JSON.parse(decision.payloadJson) as {
    candidateInstanceIds?: string[];
    visibleInstanceIds?: string[];
    visibleCards?: { instanceId: string; cardId: string }[];
    timing?: string;
    effectText?: string;
    min?: number;
    max?: number;
  };
}

function respond(s: EngineSetup, response: DecisionResponse): void {
  const decision = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(decision.seat, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response,
    }),
  ).toEqual({ ok: true });
}

describe("EX3-025 Azulongmon", () => {
  it("has the official errata identity and digivolves from blue level 5 for 4", async () => {
    const definition = getCardDefinition("EX3-025")!;
    expect(definition).toMatchObject({
      cardId: "EX3-025",
      nameEn: "Azulongmon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [{ color: "Blue", level: 5, memoryCost: 4 }],
      forms: ["Mega"],
      attributes: ["Data"],
      types: ["Holy Dragon", "Four Great Dragons", "Four Sovereigns"],
      rarity: "R",
      imageId: "EX3-025-Errata",
    });
    expect(definition.effectText).toContain("played by [Trial of the Four Great Dragons]'s effect");
    expect(definition.effectText).toContain("you may place 1 [Trial of the Four Great Dragons]");
    expect(definition.inheritedEffectText).toBeUndefined();
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "Draw", controller: "mine", amount: 2 },
            {
              kind: "GainMemory",
              amount: 2,
              condition: { kind: "triggerPlayedByEffectSource", sourceCardId: "EX3-069" },
            },
          ],
        },
        {
          trigger: "OnDeletion",
          actions: [
            {
              kind: "PlaceInBattleAreaSelf",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Option"],
                  nameOrTrait: [{ tokens: ["Trial of the Four Great Dragons"], match: "name" }],
                },
                count: 1,
                zone: "hand",
                from: "hand",
              },
              condition: {
                kind: "youHaveNone",
                filter: {
                  controllerDefault: "mine",
                  kind: ["Option"],
                  nameOrTrait: [{ tokens: ["Trial of the Four Great Dragons"], match: "name" }],
                },
              },
              optional: true,
            },
          ],
        },
      ],
    });

    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-038", under: ["BT1-032"], as: "base" }],
        hand: [{ card: "EX3-025", as: "azulongmon" }],
        deck: [{ card: "BT1-009", as: "evolutionDraw" }],
      },
    });
    s.state.memory = 4;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("azulongmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX3-025");

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-032", "BT1-038"]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("evolutionDraw").instanceId]);
  });

  it("rejects a red level 3 and a blue level 4 as evolution sources", async () => {
    for (const [source, alias] of [
      ["BT1-009", "redLevel3"],
      ["BT1-032", "blueLevel4"],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: source, as: alias }],
          hand: [{ card: "EX3-025", as: "azulongmon" }],
        },
      });
      s.state.memory = 4;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm(alias).permanentId,
          instanceId: s.inst("azulongmon").instanceId,
        }),
      ).toMatchObject({ ok: false });
      expect(s.perm(alias).topCard.cardId).toBe(source);
      expect(s.inst("azulongmon").cardId).toBe("EX3-025");
      expect(s.state.memory).toBe(4);
    }
  });

  it("uses Trial's public Delay action with exact provenance and gives Azulongmon Draw 2 plus 2 memory", async () => {
    const s = setupEngine({
      0: {
        hand: [
          { card: "EX3-069", as: "trial" },
          { card: "EX3-025", as: "azulongmon" },
          { card: "EX3-035", as: "goldramon" },
          { card: "BT1-029", as: "invalid" },
        ],
        deck: [
          { card: "BT1-030", as: "firstDraw" },
          { card: "BT1-031", as: "secondDraw" },
        ],
      },
    });
    await s.ready();
    const trialId = s.inst("trial").instanceId;
    await advance(s.engine).verb.placeOptionAsPermanent(trialId);
    s.state.turnCount += 1;
    await advance(s.engine).recompute();
    const trial = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.instanceId === trialId)!;
    const delay = delayEntry(trial)!;
    expect(delay).toBeDefined();

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trial.topCard.instanceId,
        effectKey: delay.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const decision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)?.req).toMatchObject({ sourceCardId: "EX3-069", kind: "selectCards" });
    expect(payload(decision)).toMatchObject({
      candidateInstanceIds: [s.inst("azulongmon").instanceId, s.inst("goldramon").instanceId],
      visibleInstanceIds: [
        s.inst("azulongmon").instanceId,
        s.inst("goldramon").instanceId,
        s.inst("invalid").instanceId,
      ],
      visibleCards: [
        { instanceId: s.inst("azulongmon").instanceId, cardId: "EX3-025" },
        { instanceId: s.inst("goldramon").instanceId, cardId: "EX3-035" },
        { instanceId: s.inst("invalid").instanceId, cardId: "BT1-029" },
      ],
      timing: "Main",
      effectText: expect.stringContaining("can't digivolve to level 7"),
      min: 0,
      max: 1,
    });
    respond(s, { kind: "selectCards", instanceIds: [s.inst("azulongmon").instanceId] });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-025") &&
        s.state.players[0]!.deck.length === 0 &&
        s.state.memory === 2 &&
        s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX3-069"),
    );

    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("EX3-069");
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("goldramon").instanceId,
        s.inst("invalid").instanceId,
        s.inst("firstDraw").instanceId,
        s.inst("secondDraw").instanceId,
      ]),
    );
  });

  it("an effect-driven play without Trial provenance draws 2 but does not gain memory", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-025", as: "azulongmon" }],
        deck: ["BT1-029", "BT1-030", "BT1-031"],
      },
    });
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("azulongmon").instanceId]);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.state.players[0]!.hand).toHaveLength(2);
  });

  it("a manual play pays 12 and draws 2 without gaining the conditional memory", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-025", as: "azulongmon" }],
        deck: ["BT1-029", "BT1-030", "BT1-031"],
      },
    });
    s.state.memory = 12;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("azulongmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.deck.length === 1);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand).toHaveLength(2);
  });

  it("Q3402 places Trial from hand without using its Main effect", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX3-025", as: "azulongmon" }],
          hand: [{ card: "EX3-069", as: "trial" }],
          deck: ["BT1-029", "BT1-030"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("trial").instanceId);
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("azulongmon").permanentId]);
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069"));

    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069")).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX3-069")).toBe(false);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-025" && req.kind === "optional")).toHaveLength(1);
  });

  it("Q3402 exposes the errata choice, validates among multiple Trials, and never runs Trial Main", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-025", as: "azulongmon" }],
        hand: [
          { card: "EX3-069", as: "firstTrial" },
          { card: "EX3-069", as: "secondTrial" },
          { card: "BT1-029", as: "invalid" },
        ],
        deck: [
          { card: "BT1-030", as: "wouldBeDrawn" },
          { card: "BT1-031", as: "remaining" },
        ],
      },
    });
    await s.ready();

    const deletion = advance(s.engine).verb.deletePermanent([s.perm("azulongmon").permanentId]);
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optional = s.state.pendingDecision!;
    expect(s.decisions.at(-1)?.req).toMatchObject({ sourceCardId: "EX3-025", kind: "optional" });
    expect(payload(optional)).toMatchObject({
      timing: "OnDeletion",
      effectText: expect.stringContaining("you may place 1 [Trial of the Four Great Dragons]"),
    });
    respond(s, { kind: "optional", accept: true });

    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const selection = s.state.pendingDecision!;
    const trials = [s.inst("firstTrial").instanceId, s.inst("secondTrial").instanceId];
    expect(s.decisions.at(-1)?.req).toMatchObject({ sourceCardId: "EX3-025", kind: "selectCards" });
    expect(payload(selection)).toMatchObject({
      candidateInstanceIds: trials,
      visibleInstanceIds: [...trials, s.inst("invalid").instanceId],
      visibleCards: [
        { instanceId: trials[0], cardId: "EX3-069" },
        { instanceId: trials[1], cardId: "EX3-069" },
        { instanceId: s.inst("invalid").instanceId, cardId: "BT1-029" },
      ],
      timing: "OnDeletion",
      min: 0,
      max: 1,
    });
    respond(s, { kind: "selectCards", instanceIds: [trials[1]!] });
    await deletion;

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([trials[1]]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("wouldBeDrawn").instanceId,
      s.inst("remaining").instanceId,
    ]);
    expect(s.state.memory).toBe(0);
  });

  it("does not offer the deletion effect while Trial is already in play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX3-025", as: "azulongmon" }],
          hand: [
            { card: "EX3-069", as: "trialInPlay" },
            { card: "EX3-069", as: "trialInHand" },
          ],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.placeOptionAsPermanent(s.inst("trialInPlay").instanceId);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069")).toBe(true);

    await advance(s.engine).verb.deletePermanent([s.perm("azulongmon").permanentId]);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("trialInHand").instanceId);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-025")).toHaveLength(0);
  });

  it("the errata optional can be declined without moving Trial", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-025", as: "azulongmon" }],
        hand: [{ card: "EX3-069", as: "trial" }],
      },
    });
    await s.ready();

    const deletion = advance(s.engine).verb.deletePermanent([s.perm("azulongmon").permanentId]);
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optional = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await deletion;

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("trial").instanceId);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069")).toBe(false);
  });

  it("two simultaneous deletions place only one Trial after rechecking the live board", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX3-025", as: "firstAzulongmon" },
            { card: "EX3-025", as: "secondAzulongmon" },
          ],
          hand: [
            { card: "EX3-069", as: "firstTrial" },
            { card: "EX3-069", as: "secondTrial" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("firstTrial").instanceId);
    await s.ready();

    await advance(s.engine).verb.deletePermanent([
      s.perm("firstAzulongmon").permanentId,
      s.perm("secondAzulongmon").permanentId,
    ]);
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069"));

    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX3-069")).toHaveLength(1);
    expect(s.state.players[0]!.hand.filter(({ cardId }) => cardId === "EX3-069")).toHaveLength(1);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-025" && req.kind === "optional")).toHaveLength(1);
  });

  it("an opponent's Trial does not block placing your own Trial", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX3-025", as: "azulongmon" }],
          hand: [{ card: "EX3-069", as: "ownTrial" }],
        },
        1: { battleArea: [{ card: "EX3-069", as: "opponentTrial" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("ownTrial").instanceId);
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("azulongmon").permanentId]);
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX3-069"));

    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX3-069")).toHaveLength(1);
  });

  it("draws only the available card from a one-card deck without creating a phantom", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-025", as: "azulongmon" }],
        deck: [{ card: "BT1-029", as: "onlyDraw" }],
      },
    });
    s.state.memory = 12;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("azulongmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX3-025"));

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("onlyDraw").instanceId]);
    expect(s.state.memory).toBe(0);
  });

  it("publishes no deletion decision without Trial in hand and resolves Draw 2 against an empty deck", async () => {
    const deletion = setupEngine({
      0: {
        battleArea: [{ card: "EX3-025", as: "azulongmon" }],
        hand: [{ card: "BT1-029", as: "unrelated" }],
      },
    });
    await deletion.ready();

    await advance(deletion.engine).verb.deletePermanent([deletion.perm("azulongmon").permanentId]);
    await drainMicrotasks();
    expect(deletion.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX3-025")).toBe(
      false,
    );

    expect(deletion.state.pendingDecision).toBeUndefined();
    expect(deletion.decisions.filter(({ req }) => req.sourceCardId === "EX3-025")).toHaveLength(0);
    expect(deletion.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      deletion.inst("unrelated").instanceId,
    ]);

    const emptyDeck = setupEngine({
      0: {
        hand: [{ card: "EX3-025", as: "azulongmon" }],
        deck: [],
      },
    });
    emptyDeck.state.memory = 12;
    await emptyDeck.ready();

    expect(
      emptyDeck.engine.applyIntent(0, {
        type: "playCard",
        instanceId: emptyDeck.inst("azulongmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      emptyDeck.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX3-025"),
    );

    expect(emptyDeck.state.players[0]!.deck).toHaveLength(0);
    expect(emptyDeck.state.players[0]!.hand).toHaveLength(0);
    expect(emptyDeck.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX3-025")).toHaveLength(
      1,
    );
    expect(emptyDeck.state.memory).toBe(0);
  });
});
