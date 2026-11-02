import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT21-033.js";
import "../index.js";

describe("BT21-033 compiled implementation", () => {
  it("exposes complete effect coverage with no residual clauses", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual ?? []).toEqual([]);
    expect(compiled.effects).toBeDefined();
  });

  it("preserves the registered effect triggers and action boundaries", () => {
    expect(compiled.effects.every((effect) => typeof effect.trigger === "string")).toBe(true);
    for (const effect of compiled.effects) {
      expect(Array.isArray(effect.actions)).toBe(true);
      for (const action of effect.actions ?? []) expect(typeof action.kind).toBe("string");
    }
  });

  it("reveals three, adds one Avian/Bird and one WG card, then bottoms the rest", () => {
    const onPlay = compiled.effects.find((effect) => effect.trigger === "OnPlay");

    expect(onPlay?.actions).toEqual([
      {
        kind: "RevealAdd",
        revealCount: 3,
        add: [
          {
            effectTextPart: "Add 1 card with [Avian]/[Bird] in any of its traits",
            filter: {
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["Avian", "Bird"], match: "traitContains" }],
            },
            count: 1,
            to: "hand",
          },
          {
            effectTextPart: "1 card with the [WG] trait among them to the hand.",
            filter: {
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["WG"], match: "trait" }],
            },
            count: 1,
            to: "hand",
          },
        ],
        rest: "deckBottom",
      },
    ]);
  });

  it("preserves the zero-cost WG digivolution requirement and inherited Jamming", () => {
    expect(compiled.digivolutionRequirement).toEqual([{ level: 2, traits: ["WG"], cost: 0, isAlternate: true }]);
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Static",
        isInherited: true,
        keywords: [{ keyword: "Jamming", raw: "＜Jamming＞" }],
      }),
    );
  });

  it("adds distinct Avian/Bird and WG matches and bottoms the nonmatch", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT21-033", as: "floramon" }],
          deck: [
            { card: "BT1-012", as: "bird" },
            { card: "BT21-033", as: "wg" },
            { card: "BT1-009", as: "nonmatch" },
            { card: "BT1-001", as: "unrevealed" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("floramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("bird").instanceId));

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("bird").instanceId, s.inst("wg").instanceId]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("unrevealed").instanceId);
    expect(s.state.players[0]!.deck.at(-1)!.instanceId).toBe(s.inst("nonmatch").instanceId);
  });

  it("adds at most one card for each category when one revealed card matches both", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT21-033", as: "floramon" }],
          deck: [
            { card: "BT21-038", as: "overlapAvianWG" },
            { card: "BT1-012", as: "birdOnly" },
            { card: "BT21-033", as: "wgOnly" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("floramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 2);

    const handIds = s.state.players[0]!.hand.map((card) => card.cardId);
    expect(handIds).toHaveLength(2);
    expect(handIds.some((cardId) => ["BT21-038", "BT1-012"].includes(cardId))).toBe(true);
    expect(handIds.some((cardId) => ["BT21-038", "BT21-033"].includes(cardId))).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(["BT21-038", "BT1-012", "BT21-033"]).toContain(s.state.players[0]!.deck[0]!.cardId);
  });

  it("adds only the available matching category and bottoms every other revealed card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-033", as: "floramon" }],
          deck: [
            { card: "BT21-033", as: "wg" },
            { card: "BT1-009", as: "firstNonmatch" },
            { card: "BT1-010", as: "secondNonmatch" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("floramon"));

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("wg").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.players[0]!.deck.every((card) => card.faceUp === false)).toBe(true);
  });

  it("declines both additions when all three revealed cards miss both traits", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT21-033", as: "floramon" }],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
    });
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("floramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("floramon").instanceId,
        ) && s.state.players[0]!.deck.every((card) => card.faceUp === false),
    );
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
  });

  it("evolves from a level-2 WG egg for 0 and preserves the stack", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT21-003", as: "yokomon" },
        hand: [{ card: "BT21-033", as: "floramon" }],
      },
    });
    s.state.memory = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("yokomon").permanentId,
        instanceId: s.inst("floramon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("yokomon").topCard.cardId === "BT21-033");

    expect(s.state.memory).toBe(1);
    expect(s.perm("yokomon").stack.map((card) => card.cardId)).toEqual(["BT21-003"]);
  });

  it("rejects the zero-cost alternate route from a non-WG level-2 base", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT1-003", as: "base" },
        hand: [{ card: "BT21-033", as: "floramon" }],
      },
    });
    s.state.memory = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("floramon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(1);
    expect(s.perm("base").topCard.cardId).toBe("BT1-003");
  });

  it("publicly proves inherited Jamming prevents deletion in a losing security battle", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-033", as: "floramon" }],
        hand: [{ card: "BT21-034", as: "kiwimon" }],
      },
      1: { security: [{ card: "BT1-019", as: "securityDigimon" }] },
    });
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("floramon").permanentId,
        instanceId: s.inst("kiwimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("floramon").topCard.instanceId === s.inst("kiwimon").instanceId);
    expect(observe(s.engine).hasKeyword(s.perm("floramon"), "Jamming")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("floramon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked") && !observe(s.engine).isAttacking());
    expect(s.events.some((event) => event.kind === "securityChecked")).toBe(true);
    expect(s.perm("floramon").topCard.instanceId).toBe(s.inst("kiwimon").instanceId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityDigimon").instanceId);
  });

  it("carries Jamming through a public Floramon-to-Kiwimon evolution", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-033", as: "floramon" }],
        hand: [{ card: "BT21-034", as: "kiwimon" }],
      },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("floramon").permanentId,
        instanceId: s.inst("kiwimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("floramon").topCard.cardId === "BT21-034");
    expect(observe(s.engine).hasKeyword(s.perm("floramon"), "Jamming")).toBe(true);
  });

  it("grants Jamming only while Floramon is in the evolution stack", async () => {
    const inherited = setupEngine({
      0: { battleArea: [{ card: "BT21-034", as: "host", under: ["BT21-033"] }] },
    });
    const isolated = setupEngine({ 0: { battleArea: [{ card: "BT21-033", as: "floramon" }] } });
    await inherited.ready();
    await isolated.ready();

    expect(observe(inherited.engine).hasKeyword(inherited.perm("host"), "Jamming")).toBe(true);
    expect(observe(isolated.engine).hasKeyword(isolated.perm("floramon"), "Jamming")).toBe(false);
  });
});
