import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX13-009.js";

const inertDeck = ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"];

describe("EX13-009 Huckmon", () => {
  it("matches the catalog and the complete IR contract", () => {
    expect(getCardDefinition("EX13-009")).toMatchObject({
      cardId: "EX13-009",
      set: "EX13",
      nameEn: "Huckmon",
      colors: ["Red", "White"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [{ color: "Red", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Mini Dragon"],
      effectText:
        "[On Play] Reveal the top 3 cards of your deck. Add 1 Digimon card with [Huckmon] or [Sistermon] in its text and 1 such Tamer card or Option card among them to the hand. Return the rest to the bottom of the deck.",
      inheritedEffectText: "[Your Turn] [Once Per Turn] When any of your white Digimon are played, gain 1 memory.",
    });

    expect(compiled.effects[0]).toEqual({
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 Digimon card with [Huckmon] or [Sistermon] in its text",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Huckmon", "Sistermon"], match: "text" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 such Tamer card or Option card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer", "Option"],
                nameOrTrait: [{ tokens: ["Huckmon", "Sistermon"], match: "text" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    });
    expect(compiled.effects[1]).toEqual({
      trigger: "YourTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: { controller: "mine", kind: ["Digimon"], colors: ["White"] },
          actions: [{ kind: "GainMemory", amount: 1 }],
        },
      ],
    });
    expect(compiled.effects).toHaveLength(2);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toBeUndefined();
  });

  it("reveals exactly 3, adds one Digimon and one Tamer, and bottoms the rest", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX13-009", as: "huckmon" }],
          deck: [
            { card: "BT13-013", as: "digimonMatch" },
            { card: "EX13-075", as: "tamerMatch" },
            { card: "BT1-009", as: "nonMatch" },
            { card: "BT1-010", as: "unrevealed" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("huckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 2);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("digimonMatch").instanceId, s.inst("tamerMatch").instanceId]),
    );
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("nonMatch").instanceId,
    ]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX13-009"]);
    expect(s.state.memory).toBe(2);
    expect(s.decisions.filter(({ req }) => req.kind === "selectCards")).toHaveLength(2);
  });

  it("accepts an Option card in the second slot", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX13-009", as: "huckmon" }],
          deck: [
            { card: "BT1-009", as: "firstRest" },
            { card: "ST12-14", as: "optionMatch" },
            { card: "BT1-010", as: "secondRest" },
            { card: "BT1-011", as: "unrevealed" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("huckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("optionMatch").instanceId]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("firstRest").instanceId,
      s.inst("secondRest").instanceId,
    ]);
  });

  it("Q7228/Q7229 adds a Digimon whose only matching token is [Sistermon] in effect text", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX13-009", as: "huckmon" }],
          deck: [
            { card: "BT13-019", as: "textOnlyMatch" },
            { card: "BT1-009", as: "firstRest" },
            { card: "BT1-010", as: "secondRest" },
            { card: "BT1-011", as: "unrevealed" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("huckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("textOnlyMatch").instanceId]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("firstRest").instanceId,
      s.inst("secondRest").instanceId,
    ]);
  });

  it("takes only one card when both matches are Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX13-009", as: "huckmon" }],
          deck: [
            { card: "BT13-013", as: "nameMatch" },
            { card: "BT13-019", as: "textMatch" },
            { card: "BT1-009", as: "rest" },
            { card: "BT1-010", as: "unrevealed" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("huckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.deck.every(({ faceUp }) => !faceUp));
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(3);

    const added = s.state.players[0]!.hand[0]!.instanceId;
    expect([s.inst("nameMatch").instanceId, s.inst("textMatch").instanceId]).toContain(added);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("unrevealed").instanceId, s.inst("rest").instanceId]),
    );
  });

  it("takes only one card when both matches are a Tamer and an Option", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX13-009", as: "huckmon" }],
          deck: [
            { card: "EX13-075", as: "tamerMatch" },
            { card: "ST12-14", as: "optionMatch" },
            { card: "BT1-009", as: "rest" },
            { card: "BT1-010", as: "unrevealed" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("huckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.deck.every(({ faceUp }) => !faceUp));
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect([s.inst("tamerMatch").instanceId, s.inst("optionMatch").instanceId]).toContain(
      s.state.players[0]!.hand[0]!.instanceId,
    );
    expect(s.state.players[0]!.deck).toHaveLength(3);
  });

  it("Q7230 rejects Digimon, Tamer, and Option cards without [Huckmon] or [Sistermon] in text", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX13-009", as: "huckmon" }],
          deck: [
            { card: "BT1-009", as: "digimonMiss" },
            { card: "BT1-085", as: "tamerMiss" },
            { card: "BT1-108", as: "optionMiss" },
          ],
        },
      },
      { autoOrderCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("huckmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.deck.every(({ faceUp }) => !faceUp));
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.decisions.some(({ req }) => req.kind === "selectCards")).toBe(false);
  });

  it("digivolves for 0 from a red level-2 Digi-Egg and rejects an off-color egg", async () => {
    const eligible = setupEngine({
      0: {
        breeding: { card: "BT1-001", as: "redEgg" },
        hand: [{ card: "EX13-009", as: "huckmon" }],
        deck: inertDeck,
      },
    });
    eligible.state.memory = 0;
    await eligible.ready();
    expect(
      eligible.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eligible.perm("redEgg").permanentId,
        instanceId: eligible.inst("huckmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => eligible.perm("redEgg").topCard.instanceId === eligible.inst("huckmon").instanceId);
    expect(eligible.state.memory).toBe(0);
    expect(eligible.state.players[0]!.hand).toHaveLength(1);
    expect(eligible.state.players[0]!.hand[0]!.cardId).toBe(inertDeck[0]);
    expect(eligible.state.players[0]!.deck).toHaveLength(inertDeck.length - 1);
    expect(eligible.perm("redEgg").stack.map(({ cardId }) => cardId)).toEqual(["BT1-001"]);

    const ineligible = setupEngine({
      0: {
        breeding: { card: "BT2-005", as: "blackEgg" },
        hand: [{ card: "EX13-009", as: "huckmon" }],
        deck: inertDeck,
      },
    });
    await ineligible.ready();
    expect(
      ineligible.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: ineligible.perm("blackEgg").permanentId,
        instanceId: ineligible.inst("huckmon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("keeps Huckmon as a source card and its inherited effect live after a level-4 digivolution", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX13-009", as: "huckmon" }],
        hand: [
          { card: "BT13-013", as: "baoHuckmon" },
          { card: "BT16-082", as: "white" },
        ],
        deck: inertDeck,
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("huckmon").permanentId,
        instanceId: s.inst("baoHuckmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("huckmon").topCard.instanceId === s.inst("baoHuckmon").instanceId);
    expect(s.perm("huckmon").stack.map(({ cardId }) => cardId)).toEqual(["EX13-009"]);
    expect(s.perm("huckmon").topCard.cardId).toBe("BT13-013");
    expect(s.state.memory).toBe(8);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("white").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.state.memory).toBe(6);
  });

  it("gains memory once per turn for friendly white Digimon and resets on the next own turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT13-013", under: ["EX13-009"], as: "host" }],
        hand: [
          { card: "BT16-082", as: "firstWhite" },
          { card: "BT16-082", as: "secondWhite" },
          { card: "BT16-082", as: "thirdWhite" },
          { card: "BT1-009", as: "spare" },
        ],
        deck: inertDeck,
      },
      1: { deck: inertDeck },
    });
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.state.memory).toBe(8);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.memory).toBe(5);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    const beforeReset = s.state.memory;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("thirdWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 4);
    expect(s.state.memory).toBe(beforeReset - 3 + 1);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("tracks the inherited once-per-turn use per source stack", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT13-013", under: ["EX13-009"], as: "firstHost" },
          { card: "BT13-016", under: ["EX13-009"], as: "secondHost" },
        ],
        hand: [{ card: "BT16-082", as: "white" }],
        deck: inertDeck,
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("white").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.memory).toBe(9);
  });

  it("ignores a non-white friendly Digimon and an opponent's white Digimon", async () => {
    const own = setupEngine({
      0: {
        battleArea: [{ card: "BT13-013", under: ["EX13-009"], as: "host" }],
        hand: [{ card: "BT1-009", as: "red" }],
        deck: inertDeck,
      },
    });
    own.state.memory = 10;
    await own.ready();
    expect(own.engine.applyIntent(0, { type: "playCard", instanceId: own.inst("red").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => own.state.players[0]!.battleArea.length === 2);
    expect(own.state.memory).toBe(8);

    const opponent = setupEngine({
      0: { battleArea: [{ card: "BT13-013", under: ["EX13-009"], as: "host" }], deck: inertDeck },
      1: { hand: [{ card: "BT16-082", as: "white" }], deck: inertDeck },
    });
    opponent.state.memory = 3;
    const loop = opponent.engine.startTurnLoop();
    await advance(opponent.engine).waitForMainPhase(0);
    expect(opponent.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(opponent.engine).waitForMainPhase(1);
    const before = opponent.state.memory;
    expect(opponent.engine.applyIntent(1, { type: "playCard", instanceId: opponent.inst("white").instanceId })).toEqual(
      {
        ok: true,
      },
    );
    await settle(() => opponent.state.players[1]!.battleArea.length === 1);
    expect(opponent.state.memory).toBe(before - 3);
    expect(opponent.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
