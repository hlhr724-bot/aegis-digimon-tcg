import { getCardDefinition, type DecisionResponse } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX3-055.js";

interface DecisionPayload {
  candidateInstanceIds?: string[];
  visibleCards?: Array<{ instanceId: string; cardId: string }>;
  min?: number;
  max?: number;
  timing?: string;
  effectText?: string;
  orderDestination?: string;
}

function payload(s: EngineSetup): DecisionPayload {
  return JSON.parse(s.state.pendingDecision!.payloadJson) as DecisionPayload;
}

function respond(s: EngineSetup, response: DecisionResponse): void {
  expect(
    s.engine.applyIntent(s.state.pendingDecision!.seat, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response,
    }),
  ).toEqual({ ok: true });
}

async function waitForDecision(s: EngineSetup, kind: string): Promise<void> {
  await settle(() => s.state.pendingDecision?.kind === kind);
  expect(s.state.pendingDecision?.kind).toBe(kind);
}

describe("EX3-055 Wormmon", () => {
  it("uses the official errata metadata and both zero-cost red/purple egg evolutions", async () => {
    const definition = getCardDefinition("EX3-055")!;
    expect(definition).toMatchObject({
      cardId: "EX3-055",
      colors: ["Purple"],
      level: 3,
      playCost: 3,
      dp: 1000,
      attributes: ["Free"],
      types: ["Larva"],
      rarity: "R",
      imageId: "EX3-055-Errata",
    });
    expect(definition.evoCosts).toEqual([
      { color: "Purple", level: 2, memoryCost: 0 },
      { color: "Red", level: 2, memoryCost: 0 },
    ]);
    expect(definition.effectText).toContain("trash 1 such card among them");
    expect(definition.inheritedEffectText).toContain("While you have a red Digimon in play");
    expect(definition.inheritedEffectText).toContain("＜Retaliation＞");
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "RevealAdd",
              revealCount: 3,
              add: [
                {
                  filter: {
                    controllerDefault: "mine",
                    or: [
                      { colors: ["Red", "Purple"], nameOrTrait: [{ tokens: ["Free"], match: "trait" }] },
                      { nameOrTrait: [{ tokens: ["Imperialdramon"], match: "name" }] },
                    ],
                  },
                  count: 1,
                  to: "hand",
                },
                {
                  filter: {
                    controllerDefault: "mine",
                    or: [
                      { colors: ["Red", "Purple"], nameOrTrait: [{ tokens: ["Free"], match: "trait" }] },
                      { nameOrTrait: [{ tokens: ["Imperialdramon"], match: "name" }] },
                    ],
                  },
                  count: 1,
                  to: "trash",
                },
              ],
              rest: "deckBottom",
            },
          ],
        },
        {
          trigger: "AllTurns",
          isInherited: true,
          actions: [
            {
              kind: "Aura",
              while: {
                kind: "youHave",
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Digimon"], colors: ["Red"] },
              },
              effect: { kind: "keyword", keyword: { keyword: "Retaliation" } },
            },
          ],
        },
      ],
    });

    for (const [egg, alias] of [
      ["BT10-006", "purpleEgg"],
      ["BT1-001", "redEgg"],
    ] as const) {
      const s = setupEngine({
        0: {
          breeding: { card: egg, as: alias },
          hand: [{ card: "EX3-055", as: "wormmon" }],
          deck: ["BT1-009"],
        },
      });
      s.state.memory = 0;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm(alias).permanentId,
          instanceId: s.inst("wormmon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.breeding?.topCard.cardId === "EX3-055");
      expect(s.state.memory).toBe(0);
    }
  });

  it("rejects an invalid level-3 evolution source without movement", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "wrongSource" }],
        hand: [{ card: "EX3-055", as: "wormmon" }],
      },
    });
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wrongSource").permanentId,
        instanceId: s.inst("wormmon").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(0);
    expect(s.perm("wrongSource").topCard.cardId).toBe("BT1-009");
    expect(s.inst("wormmon").cardId).toBe("EX3-055");
  });

  it("reveals 3, independently chooses an eligible card for hand and trash, and exposes the full reveal", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX3-055", as: "wormmon" }],
          deck: [
            { card: "EX3-061", as: "free" },
            { card: "EX3-063", as: "imperialdramon" },
            { card: "BT1-010", as: "ineligible" },
            { card: "BT1-011", as: "unrevealed" },
          ],
        },
      },
      { autoOrderCards: false },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("wormmon").instanceId })).toEqual({
      ok: true,
    });
    await waitForDecision(s, "selectCards");

    const visibleCards = [
      { instanceId: s.inst("free").instanceId, cardId: "EX3-061" },
      { instanceId: s.inst("imperialdramon").instanceId, cardId: "EX3-063" },
      { instanceId: s.inst("ineligible").instanceId, cardId: "BT1-010" },
    ];
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("EX3-055");
    expect(payload(s)).toMatchObject({
      candidateInstanceIds: [s.inst("free").instanceId, s.inst("imperialdramon").instanceId],
      visibleCards,
      min: 1,
      max: 1,
      timing: "OnPlay",
    });
    expect(payload(s).effectText).toContain("trash 1 such card among them");
    respond(s, { kind: "selectCards", instanceIds: [s.inst("free").instanceId] });

    await waitForDecision(s, "selectCards");
    expect(payload(s)).toMatchObject({
      candidateInstanceIds: [s.inst("imperialdramon").instanceId],
      visibleCards,
      min: 1,
      max: 1,
    });
    respond(s, { kind: "selectCards", instanceIds: [s.inst("imperialdramon").instanceId] });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("free").instanceId) &&
        s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("imperialdramon").instanceId) &&
        s.state.players[0]!.deck[0]?.instanceId === s.inst("unrevealed").instanceId,
    );

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("free").instanceId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(
      s.inst("imperialdramon").instanceId,
    );
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("ineligible").instanceId,
    ]);
  });

  it.each([true, false])("uses the errata to select blue/green Imperialdramon for hand=%s", async (imperialToHand) => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-055", as: "wormmon" }],
        deck: [
          { card: "EX3-061", as: "redFree" },
          { card: "BT3-031", as: "imperialdramon" },
          { card: "BT1-027", as: "blueFree" },
          { card: "BT1-012", as: "unrevealed" },
        ],
      },
    });
    s.state.memory = 3;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("wormmon").instanceId })).toEqual({
      ok: true,
    });
    await waitForDecision(s, "selectCards");
    expect(payload(s).candidateInstanceIds).toEqual([
      s.inst("redFree").instanceId,
      s.inst("imperialdramon").instanceId,
    ]);
    const handCard = s.inst(imperialToHand ? "imperialdramon" : "redFree").instanceId;
    const trashCard = s.inst(imperialToHand ? "redFree" : "imperialdramon").instanceId;
    respond(s, { kind: "selectCards", instanceIds: [handCard] });
    await waitForDecision(s, "selectCards");
    expect(payload(s).candidateInstanceIds).toEqual([trashCard]);
    respond(s, { kind: "selectCards", instanceIds: [trashCard] });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.trash.some((card) => card.instanceId === trashCard),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([handCard]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([trashCard]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("blueFree").instanceId,
    ]);
  });

  it("adds the only eligible card to hand, does not trash an ineligible card, and orders the other two", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX3-055", as: "wormmon" }],
          deck: [
            { card: "EX3-061", as: "onlyEligible" },
            { card: "BT1-009", as: "firstRest" },
            { card: "BT1-010", as: "secondRest" },
          ],
        },
      },
      { autoOrderCards: false },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("wormmon").instanceId })).toEqual({
      ok: true,
    });
    await waitForDecision(s, "selectCards");
    respond(s, { kind: "selectCards", instanceIds: [s.inst("onlyEligible").instanceId] });
    await waitForDecision(s, "orderCards");
    expect(s.decisions.filter(({ req }) => req.kind === "selectCards")).toHaveLength(1);
    const order = [s.inst("secondRest").instanceId, s.inst("firstRest").instanceId];
    respond(s, { kind: "orderCards", order });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.deck[0]?.instanceId === s.inst("secondRest").instanceId,
    );

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("onlyEligible").instanceId);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual(order);
  });

  it("does as much as possible when fewer than 3 cards remain and opens no impossible choice", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-055", as: "wormmon" }],
        deck: [{ card: "BT1-010", as: "onlyCard" }],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("wormmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.decisions).toHaveLength(0);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([s.inst("onlyCard").instanceId]);
  });

  it("the inherited effect follows the live red-Digimon condition and is not granted by a red card outside play", async () => {
    const noRed = setupEngine({
      0: {
        battleArea: [{ card: "BT1-028", under: ["EX3-055"], as: "host" }],
        hand: [{ card: "BT1-009", as: "redInHand" }],
      },
    });
    await noRed.ready();
    await noRed.engine.recomputeContinuousEffects();
    expect(observe(noRed.engine).hasKeyword(noRed.perm("host"), "Retaliation")).toBe(false);

    const opponentRed = setupEngine({
      0: { battleArea: [{ card: "BT1-028", under: ["EX3-055"], as: "host" }] },
      1: { battleArea: [{ card: "BT1-009", as: "opponentRed" }] },
    });
    await opponentRed.ready();
    await opponentRed.engine.recomputeContinuousEffects();
    expect(observe(opponentRed.engine).hasKeyword(opponentRed.perm("host"), "Retaliation")).toBe(false);

    const withRed = setupEngine({
      0: {
        battleArea: [
          { card: "BT1-028", under: ["EX3-055"], as: "host" },
          { card: "BT1-009", as: "redInPlay" },
        ],
      },
    });
    await withRed.ready();
    withRed.state.turnSeat = 1;
    await withRed.engine.recomputeContinuousEffects();
    expect(observe(withRed.engine).hasKeyword(withRed.perm("host"), "Retaliation")).toBe(true);
  });

  it("Free-family battle: a red Dinobeemon carrying Wormmon gains Retaliation and deletes the winner", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX3-061", under: ["EX3-055"], as: "dinobeemon" }],
        },
        1: {
          battleArea: [{ card: "EX3-060", suspended: true, as: "stronger" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.turnCount = 1;
    await s.ready();
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("dinobeemon"), "Retaliation")).toBe(true);
    const dinobeemonId = s.perm("dinobeemon").permanentId;
    const strongerId = s.perm("stronger").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: dinobeemonId,
        target: { kind: "permanent", permanentId: strongerId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === dinobeemonId) &&
        !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === strongerId),
    );

    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === dinobeemonId)).toBe(false);
    expect(s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === strongerId)).toBe(false);
  });
});
