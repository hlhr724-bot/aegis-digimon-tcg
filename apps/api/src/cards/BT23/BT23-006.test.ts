import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT23-006.js";

describe("BT23-006 Huckmon", () => {
  it("matches the catalog and complete IR contract", () => {
    expect(getCardDefinition("BT23-006")).toMatchObject({
      cardId: "BT23-006",
      nameEn: "Huckmon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [{ color: "Red", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Mini Dragon", "CS"],
      effectText:
        "[Digivolve] Lv.2 w/[CS]\u00a0trait: Cost 0 \n\n[On Play] Reveal the top 3 cards of your deck. Add 1 card with [Huckmon] or [Sistermon]\u00a0in its name and 1 card with the [Royal Knight]\u00a0trait among them to the hand. Return the rest to the bottom of the deck.",
      inheritedEffectText: "[Your Turn] [Once Per Turn] When any of your white Digimon are played, gain 1 memory.",
    });
    expect(compiled.effects[0]?.actions).toEqual([
      {
        kind: "RevealAdd",
        revealCount: 3,
        add: [
          {
            effectTextPart: "Add 1 card with [Huckmon] or [Sistermon] in its name",
            filter: {
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["Huckmon", "Sistermon"], match: "name" }],
            },
            count: 1,
            to: "hand",
          },
          {
            effectTextPart: "1 card with the [Royal Knight] trait among them to the hand.",
            filter: {
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["Royal Knight"], match: "trait" }],
            },
            count: 1,
            to: "hand",
          },
        ],
        rest: "deckBottom",
      },
    ]);
    expect(compiled.effects[1]).toEqual({
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: { controller: "mine", kind: ["Digimon"], colors: ["White"] },
          actions: [{ kind: "GainMemory", amount: 1 }],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    });
    expect(compiled.digivolutionRequirement).toEqual([{ level: 2, traits: ["CS"], cost: 0, isAlternate: true }]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("reveals exactly 3, adds one name match and one Royal Knight, and bottoms the rest", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT23-006", as: "huckmon" }],
          deck: [
            { card: "BT13-013", as: "nameMatch" },
            { card: "BT13-112", as: "royalKnight" },
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
    await settle(
      () =>
        s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("nameMatch").instanceId) &&
        s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("royalKnight").instanceId),
    );

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("nameMatch").instanceId, s.inst("royalKnight").instanceId]),
    );
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("nonMatch").instanceId,
    ]);
  });

  it("returns all revealed cards to the bottom when neither category matches", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT23-006", as: "huckmon" }],
          deck: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
            { card: "BT1-011", as: "third" },
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

  it("adds only the category that is present and bottoms the other two revealed cards", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT23-006", as: "huckmon" }],
          deck: [
            { card: "BT13-112", as: "royalKnight" },
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
    await settle(() =>
      s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("royalKnight").instanceId),
    );

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("royalKnight").instanceId]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("firstRest").instanceId,
      s.inst("secondRest").instanceId,
    ]);
  });

  it("digivolves for 0 from an off-color level 2 CS Digi-Egg and rejects an off-color non-CS egg", async () => {
    const eligible = setupEngine({
      0: {
        breeding: { card: "BT23-003", as: "csEgg" },
        hand: [{ card: "BT23-006", as: "huckmon" }],
        deck: ["BT1-009"],
      },
    });
    eligible.state.memory = 0;
    await eligible.ready();
    expect(
      eligible.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eligible.perm("csEgg").permanentId,
        instanceId: eligible.inst("huckmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => eligible.perm("csEgg").topCard.instanceId === eligible.inst("huckmon").instanceId);
    expect(eligible.state.memory).toBe(0);

    const ineligible = setupEngine({
      0: {
        breeding: { card: "BT2-005", as: "blackEgg" },
        hand: [{ card: "BT23-006", as: "huckmon" }],
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

  it("gains memory for only the first friendly white Digimon played that turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT23-008", under: ["BT23-006"], as: "host" }],
        hand: [
          { card: "BT16-082", as: "firstWhite" },
          { card: "BT16-082", as: "secondWhite" },
        ],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.memory === 8);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.memory).toBe(5);
  });

  it("evolves Huckmon through a public level-4 transition and resets the inherited trigger next turn", async () => {
    const s = setupEngine({
      0: {
        deck: ["BT1-009", "BT1-009", "BT1-009"],
        battleArea: [{ card: "BT23-006", as: "huckmon" }],
        hand: [
          { card: "BT23-008", as: "greymon" },
          { card: "BT16-082", as: "firstWhite" },
          { card: "BT16-082", as: "secondWhite" },
          { card: "BT16-082", as: "thirdWhite" },
        ],
      },
      1: { deck: ["BT1-009", "BT1-009", "BT1-009"] },
    });
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const evolutionResult = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("huckmon").permanentId,
      instanceId: s.inst("greymon").instanceId,
    });
    expect(evolutionResult).toEqual({ ok: true });
    await settle(() => s.perm("huckmon").topCard.instanceId === s.inst("greymon").instanceId);
    expect(s.perm("huckmon").stack.map(({ cardId }) => cardId)).toEqual(["BT23-006"]);
    expect(s.perm("huckmon").topCard.cardId).toBe("BT23-008");
    expect(s.state.memory).toBe(8);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.state.memory).toBe(6);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.memory).toBe(3);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("thirdWhite").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 4);
    expect(s.state.memory).toBe(1);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("tracks the inherited once-per-turn use independently for two Huckmon sources", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT23-008", under: ["BT23-006"], as: "firstHost" },
          { card: "BT23-010", under: ["BT23-006"], as: "secondHost" },
        ],
        hand: [{ card: "BT16-082", as: "white" }],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("white").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.memory).toBe(9);
  });

  it("does not gain memory for a non-white Digimon or an opponent's white Digimon", async () => {
    const own = setupEngine({
      0: {
        battleArea: [{ card: "BT23-008", under: ["BT23-006"], as: "host" }],
        hand: [{ card: "BT1-009", as: "red" }],
      },
    });
    own.state.memory = 10;
    await own.ready();
    expect(own.engine.applyIntent(0, { type: "playCard", instanceId: own.inst("red").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => own.state.players[0]!.battleArea.length === 2);
    expect(own.state.memory).toBe(8);

    const deck = ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"];
    const opponent = setupEngine({
      0: { battleArea: [{ card: "BT23-008", under: ["BT23-006"], as: "host" }], deck },
      1: { hand: [{ card: "BT16-082", as: "white" }], deck },
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
