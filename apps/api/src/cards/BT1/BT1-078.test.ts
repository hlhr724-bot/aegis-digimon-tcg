import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-078.js";
import "../BT10/BT10-056.js";

describe("BT1-078 Jagamon", () => {
  it("matches the catalog and exact When Attacking digivolution IR contract", () => {
    expect(getCardDefinition("BT1-078")).toMatchObject({
      cardId: "BT1-078",
      set: "BT1",
      nameEn: "Jagamon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [{ color: "Green", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Vegetation"],
      effectText:
        "[When Attacking] Reveal 3 cards from the top of your deck. You can digivolve this card into 1 level 6 green Digimon card among them without paying its memory cost. Place the remaining cards at the bottom of your deck in any order.",
      rarity: "U",
      maxCountInDeck: 4,
      imageId: "BT1-078",
      nameJp: "ジャガモン",
    });
    expect(getCardDefinition("BT1-078")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-078")?.securityEffectText).toBeUndefined();
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "RevealAdd",
              revealCount: 3,
              digivolveOption: {
                into: { controllerDefault: "mine", kind: ["Digimon"], colors: ["Green"], levels: [6] },
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                payCost: false,
                optional: true,
              },
              add: [],
              rest: "deckBottomAnyOrder",
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("evolves from a green level 4 and keeps the source beneath Jagamon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-074", as: "base" }],
        hand: [{ card: "BT1-078", as: "jagamon" }],
        deck: ["BT1-010"],
      },
    });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jagamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("jagamon").instanceId);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-074"]);
    expect(s.state.memory).toBe(0);
  });

  it("reveals 3 cards and may digivolve into a revealed level 6 green Digimon for free", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-078", as: "attacker" }],
          deck: [{ card: "BT1-081", as: "evolution" }, "BT1-010", "BT1-011", { card: "BT1-012", as: "drawn" }],
        },
        1: { security: ["BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("attacker").topCard.instanceId === s.inst("evolution").instanceId &&
        s.state.players[0]!.deck.length === 2 &&
        s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId) &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-078"),
    );
    expect(s.perm("attacker").topCard.cardId).toBe("BT1-081");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("drawn").instanceId);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("may decline the revealed evolution and bottoms every revealed card", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-078", as: "attacker" }],
        deck: [
          { card: "BT1-081", as: "evolution" },
          { card: "BT1-010", as: "missA" },
          { card: "BT1-011", as: "missB" },
        ],
      },
      1: { security: ["BT1-012"] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const decline = s.decisions.at(-1)!.req;
    expect(decline.options).toMatchObject({ min: 0, max: 1 });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decline.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && s.state.pendingDecision === undefined);

    expect(s.perm("attacker").topCard.cardId).toBe("BT1-078");
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("evolution").instanceId, s.inst("missA").instanceId, s.inst("missB").instanceId]),
    );
  });

  it("orders the remaining cards before opening the new Digimon's When Digivolving window (Q932)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-078", as: "attacker" }],
          deck: [
            { card: "BT10-056", as: "evolution" },
            { card: "BT1-010", as: "first" },
            { card: "BT1-011", as: "second" },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-016", as: "target" }],
          security: ["BT1-012"],
        },
      },
      { autoSelectCards: true, autoOrderCards: false },
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderCards");

    expect(s.perm("attacker").topCard.instanceId).toBe(s.inst("evolution").instanceId);
    expect(s.perm("target").isSuspended).toBe(false);
    const decision = s.decisions.at(-1)!.req;
    const order = [s.inst("second").instanceId, s.inst("first").instanceId];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "orderCards", order },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").isSuspended);

    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(order);
  });

  it("reveals as many cards as possible with fewer than 3 cards (Q933)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-078", as: "attacker" }],
          deck: [
            { card: "BT1-081", as: "evolution" },
            { card: "BT1-010", as: "rest" },
          ],
        },
        1: { security: ["BT1-012"] },
      },
      { autoSelectCards: true },
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("attacker").topCard.instanceId === s.inst("evolution").instanceId &&
        s.state.players[0]!.deck.some((card) => card.instanceId === s.inst("rest").instanceId) &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-078"),
    );

    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("rest").instanceId]);
  });

  it("rejects ordinary evolution from a non-green level 4", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-036", as: "blueBase" }], hand: [{ card: "BT1-078", as: "jagamon" }] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("blueBase").permanentId,
        instanceId: s.inst("jagamon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });
});

describe("BT1-078 Jagamon — KB Q&A rulings", () => {
  it("may reveal and decline to digivolve, returning every revealed card to the deck bottom (Q930)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-078", as: "attacker" }],
        deck: [
          { card: "BT1-081", as: "evolution" },
          { card: "BT1-010", as: "missA" },
          { card: "BT1-011", as: "missB" },
          { card: "BT1-012", as: "unrevealed" },
        ],
      },
      1: { security: ["BT1-012"] },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const offer = s.decisions.at(-1)!.req;
    expect(offer.options?.candidateInstanceIds).toContain(s.inst("evolution").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: offer.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && s.state.pendingDecision === undefined);

    expect(s.perm("attacker").topCard.cardId).toBe("BT1-078");
    const deckIds = s.state.players[0]!.deck.map((card) => card.instanceId);
    expect(deckIds[0]).toBe(s.inst("unrevealed").instanceId);
    expect(deckIds.slice(1)).toEqual(
      expect.arrayContaining([s.inst("evolution").instanceId, s.inst("missA").instanceId, s.inst("missB").instanceId]),
    );
    expect(deckIds).toHaveLength(4);
  });

  it("performs the digivolution bonus draw from the unrevealed deck before the rest is bottomed (Q931)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-078", as: "attacker" }],
          deck: [
            { card: "BT1-081", as: "evolution" },
            { card: "BT1-010", as: "first" },
            { card: "BT1-011", as: "second" },
            { card: "BT1-012", as: "drawn" },
            { card: "BT1-013", as: "spare" },
          ],
        },
        1: { security: ["BT1-012"] },
      },
      { autoSelectCards: true, autoOrderCards: false },
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderCards");

    expect(s.perm("attacker").topCard.instanceId).toBe(s.inst("evolution").instanceId);
    const handIds = s.state.players[0]!.hand.map((card) => card.instanceId);
    expect(handIds).toEqual([s.inst("drawn").instanceId]);
    expect(handIds).not.toContain(s.inst("first").instanceId);
    expect(handIds).not.toContain(s.inst("second").instanceId);

    const decision = s.decisions.at(-1)!.req;
    const order = [s.inst("second").instanceId, s.inst("first").instanceId];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "orderCards", order },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.deck.length === 3);

    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("spare").instanceId, ...order]);
  });
});
