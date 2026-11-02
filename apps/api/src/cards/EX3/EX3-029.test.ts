import { getCardDefinition, type DecisionResponse } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { compiled } from "./EX3-029.js";

function payload(s: EngineSetup): Record<string, unknown> {
  return JSON.parse(s.state.pendingDecision!.payloadJson) as Record<string, unknown>;
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

describe("EX3-029 Airdramon", () => {
  it("has the official identity and digivolves from a yellow level 3 for 2", async () => {
    expect(getCardDefinition("EX3-029")).toMatchObject({
      cardId: "EX3-029",
      nameEn: "Airdramon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      evoCosts: [{ color: "Yellow", level: 3, memoryCost: 2 }],
      forms: ["Champion"],
      attributes: ["Vaccine"],
      types: ["Mythical Beast"],
      rarity: "C",
      imageId: "EX3-029",
    });
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "SecurityManipulation",
              op: "toHand",
              controller: "mine",
              amount: 1,
              chooseFromSecurity: true,
              bindResultAs: "selectedSecurity",
            },
            {
              kind: "ConditionalBranch",
              condition: {
                kind: "bindingContains",
                ref: "selectedSecurity",
                filter: { colors: ["Yellow"] },
              },
              ifTrue: [{ kind: "Recover", amount: 1 }],
            },
            { kind: "SecurityManipulation", op: "shuffle", controller: "mine" },
          ],
        },
      ],
    });

    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-027", under: ["BT1-009"], as: "base" }],
        hand: [{ card: "EX3-029", as: "airdramon" }],
        deck: ["BT1-010"],
      },
    });
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("airdramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX3-029");

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-009", "EX3-027"]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT1-010");
  });

  it("rejects a red level-3 evolution source", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "invalidSource" }],
        hand: [{ card: "EX3-029", as: "airdramon" }],
      },
    });
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("invalidSource").permanentId,
        instanceId: s.inst("airdramon").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.perm("invalidSource").topCard.cardId).toBe("BT1-009");
    expect(s.inst("airdramon").cardId).toBe("EX3-029");
    expect(s.state.memory).toBe(2);
  });

  it("privately searches all security, adds the chosen yellow card, recovers and shuffles", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-029", as: "airdramon" }],
        security: [
          { card: "BT1-009", as: "redSecurity" },
          { card: "BT1-045", as: "yellowSecurity" },
        ],
        deck: [{ card: "BT1-010", as: "recovery" }],
      },
    });
    s.state.memory = 10;
    const yellowId = s.inst("yellowSecurity").instanceId;
    const redId = s.inst("redSecurity").instanceId;
    const recoveryId = s.inst("recovery").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("airdramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const decision = s.state.pendingDecision!;
    expect(decision.seat).toBe(0);
    expect(s.decisions.at(-1)!.req).toMatchObject({
      kind: "selectCards",
      sourceCardId: "EX3-029",
      options: {
        timing: "OnPlay",
        effectText: expect.stringContaining("Search your security"),
        candidateInstanceIds: expect.arrayContaining([redId, yellowId]),
        visibleInstanceIds: expect.arrayContaining([redId, yellowId]),
        visibleCards: expect.arrayContaining([
          { instanceId: redId, cardId: "BT1-009" },
          { instanceId: yellowId, cardId: "BT1-045" },
        ]),
        min: 1,
        max: 1,
      },
    });
    expect(payload(s).candidateInstanceIds).toHaveLength(2);
    expect(payload(s).visibleInstanceIds).toHaveLength(2);
    expect(payload(s).visibleCards).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }).ok,
    ).toBe(false);
    respond(s, { kind: "selectCards", instanceIds: [yellowId] });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.hand.some(({ instanceId }) => instanceId === yellowId) &&
        s.state.players[0]!.security.length === 2 &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX3-029"),
    );

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(yellowId);
    expect(s.state.players[0]!.hand.find(({ instanceId }) => instanceId === yellowId)?.faceUp).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId).sort()).toEqual([redId, recoveryId].sort());
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.security.every(({ faceUp }) => !faceUp)).toBe(true);
    expect(s.state.memory).toBe(5);
    expect(s.events.filter(({ kind }) => kind === "cardRevealed")).toEqual([
      { kind: "cardRevealed", seat: 0, cardId: "BT1-045", sourceCardId: "EX3-029" },
    ]);
    expect(s.events).toContainEqual({ kind: "securityRecovered", seat: 0, amount: 1 });
    expect(s.events).not.toContainEqual(expect.objectContaining({ kind: "cardRevealed", cardId: "BT1-009" }));
  });

  it("Mythical Beast family: a yellow multicolor card found in security still enables Recovery", async () => {
    expect(getCardDefinition("BT10-055")?.colors).toEqual(expect.arrayContaining(["Yellow"]));
    expect(getCardDefinition("BT10-055")?.colors).toHaveLength(2);
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX3-029", as: "airdramon" }],
          security: [{ card: "BT10-055", as: "yellowMythicalBeast" }, "BT1-009"],
          deck: [{ card: "BT1-010", as: "recovery" }],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("yellowMythicalBeast").instanceId);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("airdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("yellowMythicalBeast").instanceId) &&
        s.state.players[0]!.security.length === 2,
    );

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toContain(s.inst("recovery").instanceId);
  });

  it("adds a chosen non-yellow card without recovering", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX3-029", as: "airdramon" }],
          security: [{ card: "BT1-009", as: "redChoice" }, "BT1-045"],
          deck: [{ card: "BT1-011", as: "deckTop" }],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("redChoice").instanceId);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("airdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("redChoice").instanceId),
    );

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("deckTop").instanceId);
    expect(s.events).toContainEqual({
      kind: "cardRevealed",
      seat: 0,
      cardId: "BT1-009",
      sourceCardId: "EX3-029",
    });
    expect(s.events.some(({ kind }) => kind === "securityRecovered")).toBe(false);
  });

  it("adds and reveals a yellow choice with an empty deck without inventing a Recovery", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX3-029", as: "airdramon" }],
          security: [
            { card: "BT1-045", as: "yellowChoice" },
            { card: "BT1-009", as: "rest" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("yellowChoice").instanceId);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("airdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("yellowChoice").instanceId),
    );

    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([s.inst("rest").instanceId]);
    expect(s.events).toContainEqual({
      kind: "cardRevealed",
      seat: 0,
      cardId: "BT1-045",
      sourceCardId: "EX3-029",
    });
    expect(s.events.some(({ kind }) => kind === "securityRecovered")).toBe(false);
  });

  it("finishes without a decision when the security stack is empty", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-029", as: "airdramon" }],
        deck: [{ card: "BT1-012", as: "deckTop" }],
      },
    });
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("airdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle();

    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-029")).toHaveLength(0);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("deckTop").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(0);
  });
});

describe("EX3-029 Airdramon — KB Q&A rulings", () => {
  it("looks at every security card privately and reveals only the card added to hand (Q3405)", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "EX3-029", as: "airdramon" }],
        security: [
          { card: "BT1-009", as: "hiddenSecurity" },
          { card: "BT1-010", as: "otherHiddenSecurity" },
          { card: "BT1-085", as: "chosenSecurity" },
        ],
        deck: ["BT1-011"],
      },
    });
    s.state.memory = 10;
    const hiddenIds = [s.inst("hiddenSecurity").instanceId, s.inst("otherHiddenSecurity").instanceId];
    const chosenId = s.inst("chosenSecurity").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("airdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const search = s.state.pendingDecision!;
    expect(search.seat).toBe(0);
    expect(payload(s).visibleInstanceIds).toEqual(expect.arrayContaining([...hiddenIds, chosenId]));
    expect(payload(s).candidateInstanceIds).toEqual(expect.arrayContaining([...hiddenIds, chosenId]));
    expect(s.state.players[0]!.security.every(({ faceUp }) => !faceUp)).toBe(true);
    expect(s.events.some(({ kind }) => kind === "cardRevealed")).toBe(false);

    respond(s, { kind: "selectCards", instanceIds: [chosenId] });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX3-029"),
    );

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(chosenId);
    expect(s.events.filter(({ kind }) => kind === "cardRevealed")).toEqual([
      { kind: "cardRevealed", seat: 0, cardId: "BT1-085", sourceCardId: "EX3-029" },
    ]);
    expect(s.state.players[0]!.security.every(({ faceUp }) => !faceUp)).toBe(true);
  });
});
