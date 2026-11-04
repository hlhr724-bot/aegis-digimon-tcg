import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX2-072.js";
import "../EX6/EX6-054.js";
import "../EX10/EX10-013.js";
import "../EX10/EX10-052.js";
import "./EX2-014.js";
import "./EX2-019.js";
import "./EX2-021.js";
import "./EX2-046.js";
import "./EX2-060.js";
import "./EX2-072.js";

const inertDeck = ["BT1-009", "BT1-013", "BT1-009", "BT1-013"];
const inertSecurity = ["BT1-009", "BT1-013"];

it.each(["EX10-052", "EX6-054"])("GitHub #5268: Blue Card cannot evolve Chaos Mode into %s", async (revealedCard) => {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "EX10-052", as: "base" }, "EX2-060"],
        hand: [{ card: "EX2-072", as: "option" }],
        deck: [{ card: revealedCard, as: "revealed" }, "EX2-066", "EX2-067", "EX2-068", "EX2-069", "BT1-009"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
  );
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({ ok: true });
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
  expect(s.perm("base").topCard.instanceId).toBe(s.inst("base").instanceId);
  expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("revealed").instanceId)).toBe(true);
  expect(s.events.some((e) => e.kind === "digivolved")).toBe(false);
});

it.each(["EX10-052", "EX6-054"])(
  "GitHub #5268: Blue Card still evolves exact Lucemon into %s for free",
  async (revealedCard) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-013", as: "base" }, "EX2-060"],
          hand: [{ card: "EX2-072", as: "option" }],
          deck: [
            { card: revealedCard, as: "revealed" },
            "EX2-066",
            "EX2-067",
            "EX2-068",
            "EX2-069",
            "BT1-009",
            "BT1-009",
          ],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderCards: true,
        autoOrderTriggers: true,
        declinePrompts: ["By trashing 1 card"],
      },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("revealed").instanceId);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["EX10-013"]);
    expect(s.state.memory).toBe(7);
  },
);

describe("EX2-072 Blue Card", () => {
  it("matches the catalog, Q3362-Q3365, and typed compiled IR", () => {
    expect(getCardDefinition("EX2-072")).toMatchObject({
      cardId: "EX2-072",
      nameEn: "Blue Card",
      colors: ["White"],
      kinds: ["Option"],
      playCost: 3,
      dp: 0,
      evoCosts: [],
      rarity: "R",
      maxCountInDeck: 4,
      effectText:
        "While you have a Tamer in play, you may use this card without meeting its color requirements.[Main] Reveal the top 5 cards of your deck. You may digivolve 1 of your Digimon into 1 non-white Digimon card among them without paying its memory cost. If you don't, add 1 Digimon card among them to your hand. Place the remaining cards at the bottom of your deck in any order.",
      securityEffectText: "[Security] You may play 1 Tamer card from your hand without paying its memory cost.",
    });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Static",
          actions: [
            {
              kind: "WaiveColorRequirement",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              condition: {
                kind: "youHave",
                filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"] },
                raw: "you have a Tamer in play",
              },
            },
          ],
        }),
        expect.objectContaining({
          trigger: "Main",
          actions: [
            expect.objectContaining({
              kind: "RevealAdd",
              revealCount: 5,
              digivolveOption: {
                into: { controllerDefault: "mine", kind: ["Digimon"], excludeColors: ["White"] },
                payCost: false,
                optional: true,
              },
              add: [
                {
                  filter: { controllerDefault: "mine", kind: ["Digimon"] },
                  count: 1,
                  to: "hand",
                  ifDigivolveDeclined: true,
                },
              ],
              rest: "deckBottomAnyOrder",
            }),
          ],
        }),
        expect.objectContaining({
          trigger: "Security",
          isSecurity: true,
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", kind: ["Tamer"] }, count: 1 },
              from: ["hand"],
              payCost: false,
              optional: true,
            },
          ],
        }),
      ]),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("reveals five and adds a Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["EX2-060", "EX2-046"],
          hand: [{ card: "EX2-072", as: "option" }],
          deck: [{ card: "EX2-019", as: "digimon" }, ...inertDeck],
          security: inertSecurity,
        },
        1: { deck: inertDeck, security: inertSecurity },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("digimon").instanceId),
    );
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("digimon").instanceId)).toBe(true);
  });

  it("may digivolve a compatible Digimon into a revealed non-white Digimon without paying its cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX2-019", as: "renamon" },
            { card: "EX2-060", as: "rika" },
            { card: "EX2-046", as: "whiteSource" },
          ],
          hand: [{ card: "EX2-072", as: "blueCard" }],
          deck: [
            { card: "EX2-021", as: "kyubimon" },
            "EX2-066",
            "EX2-067",
            "EX2-068",
            "EX2-069",
            { card: "BT1-009", as: "bonusDraw" },
          ],
          security: inertSecurity,
        },
        1: { deck: inertDeck, security: inertSecurity },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderCards: true,
        autoOrderTriggers: true,
      },
    );
    s.state.memory = 10;
    const memoryBefore = s.state.memory;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("blueCard").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("renamon").topCard.instanceId === s.inst("kyubimon").instanceId);

    expect(s.perm("renamon").topCard.cardId).toBe("EX2-021");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    // Renamon gains its inherited watcher during this Option's Main effect,
    // after the use event; it cannot refund this Blue Card's printed cost of 3.
    expect(s.state.memory).toBe(memoryBefore - 3);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("EX2-066");
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toHaveLength(3);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX2-067", "EX2-068", "EX2-069"]),
    );
  });

  it("does not waive the white color requirement without a Tamer", async () => {
    const s = setupEngine({ 0: { battleArea: ["EX2-014"], hand: [{ card: "EX2-072", as: "option" }] } });
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("waives the white color requirement with a Tamer even when no white card is in play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["EX2-014", "EX2-060"],
          hand: [{ card: "EX2-072", as: "option" }],
          deck: inertDeck,
          security: inertSecurity,
        },
        1: { deck: inertDeck, security: inertSecurity },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined);
  });

  it("may decline the compatible digivolution and then adds a revealed Digimon to hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["EX2-019", "EX2-060"],
          hand: [{ card: "EX2-072", as: "option" }],
          deck: [{ card: "EX2-021", as: "revealedDigimon" }, "EX2-014", "EX2-015", "EX2-031", "EX2-032"],
          security: inertSecurity,
        },
        1: { deck: inertDeck, security: inertSecurity },
      },
      { autoOrderCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.decisions.some(({ req }) => req.kind === "selectCards"));
    const digivolveDecision = s.decisions.find(({ req }) => req.kind === "selectCards");
    expect(digivolveDecision).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: digivolveDecision!.req.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.filter(({ req }) => req.kind === "selectCards").length >= 2);
    const fallbackDecision = s.decisions.filter(({ req }) => req.kind === "selectCards").at(-1);
    expect(fallbackDecision).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: fallbackDecision!.req.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("revealedDigimon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("revealedDigimon").instanceId),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("revealedDigimon").instanceId);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["EX2-014", "EX2-015", "EX2-031", "EX2-032"]);
  });

  it("reveals all available cards when the deck has fewer than five (Q3365)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["EX2-060"],
          hand: [{ card: "EX2-072", as: "option" }],
          deck: [{ card: "BT1-009", as: "revealed" }, "BT1-013", "BT1-009"],
          security: inertSecurity,
        },
        1: { deck: inertDeck, security: inertSecurity },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("revealed").instanceId));
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("revealed").instanceId);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("plays a Tamer from hand without cost when revealed from security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-013", as: "attacker" }],
          deck: inertDeck,
          security: inertSecurity,
        },
        1: {
          hand: [{ card: "EX2-060", as: "tamer" }],
          deck: inertDeck,
          security: [{ card: "EX2-072", as: "securityOption" }, ...inertSecurity],
        },
      },
      { autoAcceptOptional: true, autoOrderTriggers: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() &&
        s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("tamer").instanceId),
    );
    expect(
      s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("tamer").instanceId),
    ).toBe(true);
  });

  it("may decline to play a Tamer when Blue Card is revealed from Security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-013", as: "attacker" }],
          deck: inertDeck,
          security: inertSecurity,
        },
        1: {
          hand: [{ card: "EX2-060", as: "tamer" }],
          deck: inertDeck,
          security: [{ card: "EX2-072", as: "securityOption" }, ...inertSecurity],
        },
      },
      { autoOrderTriggers: true },
    );
    await s.ready();
    const memoryBefore = s.state.memory;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("tamer").instanceId);
    expect(
      s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("tamer").instanceId),
    ).toBe(false);
    expect(s.state.memory).toBe(memoryBefore);
  });
});

describe("EX2-072 Blue Card — KB Q&A rulings", () => {
  async function digivolveThroughBlueCard() {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX2-019", as: "renamon" },
            { card: "EX2-060", as: "rika" },
          ],
          hand: [{ card: "EX2-072", as: "blueCard" }],
          deck: [
            { card: "EX2-021", as: "kyubimon" },
            { card: "EX2-066", as: "plugIn" },
            "EX2-067",
            "EX2-068",
            "EX2-069",
            { card: "BT1-009", as: "bonusDraw" },
          ],
          security: inertSecurity,
        },
        1: { deck: inertDeck, security: inertSecurity },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    const revealedIds = ["kyubimon", "plugIn"].map((alias) => s.inst(alias).instanceId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blueCard").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("plugIn").instanceId));
    await settle(() => s.state.pendingDecision === undefined);
    const eventIndex = (predicate: (event: (typeof s.events)[number]) => boolean) => s.events.findIndex(predicate);
    return {
      s,
      bonusDrawIndex: eventIndex(
        (event) =>
          event.kind === "cardsMoved" &&
          event.to === "hand" &&
          event.instanceIds.includes(s.inst("bonusDraw").instanceId),
      ),
      restToDeckIndex: eventIndex(
        (event) =>
          event.kind === "cardsMoved" && event.to === "deckBottom" && event.instanceIds.includes(revealedIds[1]!),
      ),
      whenDigivolvingAddIndex: eventIndex(
        (event) => event.kind === "cardsMoved" && event.to === "hand" && event.instanceIds.includes(revealedIds[1]!),
      ),
    };
  }

  it("draws the digivolution bonus from the unrevealed deck before the revealed cards go to the bottom (Q3363)", async () => {
    const { s, bonusDrawIndex, restToDeckIndex } = await digivolveThroughBlueCard();
    expect(s.perm("renamon").topCard.instanceId).toBe(s.inst("kyubimon").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("bonusDraw").instanceId);
    expect(bonusDrawIndex).toBeGreaterThanOrEqual(0);
    expect(restToDeckIndex).toBeGreaterThan(bonusDrawIndex);
  });

  it("resolves the digivolved card's [When Digivolving] only after the rest return to the deck bottom (Q3364)", async () => {
    const { s, restToDeckIndex, whenDigivolvingAddIndex } = await digivolveThroughBlueCard();
    expect(restToDeckIndex).toBeGreaterThanOrEqual(0);
    expect(whenDigivolvingAddIndex).toBeGreaterThan(restToDeckIndex);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("plugIn").instanceId);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX2-067", "EX2-068", "EX2-069"]),
    );
  });
});
