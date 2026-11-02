import { describe, expect, it } from "vitest";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT21-047.js";
import "../index.js";

describe("BT21-047 compiled implementation", () => {
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

  it("preserves the Appmon link requirement and linked Piercing keyword", () => {
    expect(compiled.linkRequirement).toEqual([{ traits: ["Appmon"], cost: 1 }]);
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Static",
        isLinked: true,
        keywords: [{ keyword: "Piercing", raw: "＜Piercing＞" }],
      }),
    );
  });

  it("reveals three cards, adds one Appmon and one App Driver, then bottoms the rest", () => {
    const onPlay = compiled.effects.find((effect) => effect.trigger === "OnPlay");
    expect(onPlay?.actions).toEqual([
      {
        kind: "RevealAdd",
        revealCount: 3,
        add: [
          {
            effectTextPart: "Add 1 card with the [Appmon] trait",
            filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Appmon"], match: "trait" }] },
            count: 1,
            to: "hand",
          },
          {
            effectTextPart: "1 card with the [App Driver] trait among them to the hand.",
            filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["App Driver"], match: "trait" }] },
            count: 1,
            to: "hand",
          },
        ],
        rest: "deckBottom",
      },
    ]);
  });

  it("preserves the zero-cost Appmon alternate Digivolution requirement", () => {
    expect(compiled.digivolutionRequirement).toEqual([{ level: 2, traits: ["Appmon"], cost: 0, isAlternate: true }]);
  });

  it("resolves the public On Play reveal by adding App Driver and Appmon cards", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT21-047", as: "navimon" }],
          deck: [
            { card: "BT21-047", as: "appmon" },
            { card: "BT21-084", as: "appDriver" },
            { card: "BT1-009", as: "rest" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("navimon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("appDriver").instanceId));
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("appDriver").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("appmon").instanceId)).toBe(true);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("rest").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("zero-cost digivolves from a level-2 Appmon egg in the breeding area", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT21-005", as: "appmonEgg" },
        hand: [{ card: "BT21-047", as: "navimon" }],
      },
    });
    s.state.memory = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("appmonEgg").permanentId,
        instanceId: s.inst("navimon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("appmonEgg").topCard.instanceId === s.inst("navimon").instanceId);

    expect(s.state.memory).toBe(1);
  });

  it("publicly leaves all revealed cards in deck when neither search bucket matches", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "BT21-047", as: "navimon" }], deck: ["BT1-009", "BT1-018", "BT1-026"] },
    });
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("navimon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT21-047"));
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("refuses linking onto a non-Appmon host and preserves the paid card", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "nonAppmon" }],
        hand: [{ card: "BT21-047", as: "navimon" }],
      },
    });
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("navimon").instanceId,
        targetPermanentId: s.perm("nonAppmon").permanentId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("navimon").instanceId)).toBe(true);
    expect(s.state.memory).toBe(2);
  });

  it("links for 1, grants 2000 DP, and gives its Appmon host observable Piercing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-009", as: "host" }],
          hand: [{ card: "BT21-047", as: "navimon" }],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "target", suspended: true }],
          security: [{ card: "BT1-010", as: "security" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();
    const baseDp = s.perm("host").currentDP;

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("navimon").instanceId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").linked.some((card) => card.instanceId === s.inst("navimon").instanceId));
    expect(s.state.memory).toBe(1);
    expect(s.perm("host").currentDP).toBe(baseDp + 2000);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && !observe(s.engine).isAttacking());
    expect(observe(s.engine).isAttacking()).toBe(false);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });
});
