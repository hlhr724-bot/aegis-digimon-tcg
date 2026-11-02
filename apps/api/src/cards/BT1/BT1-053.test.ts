import { describe, expect, it } from "vitest";
import { getCardDefinition, Phase } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import darcmon from "./BT1-053.js";
import "./BT1-056.js";

describe("BT1-053 Darcmon", () => {
  it("matches the catalog and exact Your Turn watcher IR contract", () => {
    expect(getCardDefinition("BT1-053")).toMatchObject({
      cardId: "BT1-053",
      set: "BT1",
      nameEn: "Darcmon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 4000,
      evoCosts: [{ color: "Yellow", level: 3, memoryCost: 2 }],
      forms: ["Champion"],
      attributes: ["Vaccine"],
      types: ["Angel"],
      effectText:
        "[Your Turn] When you play a level 3 yellow Digimon, if this Digimon is suspended, trigger ＜Draw 1＞ (Draw 1 card from your deck).",
      rarity: "U",
      maxCountInDeck: 4,
      imageId: "BT1-053",
      nameJp: "ダルクモン",
    });
    expect(getCardDefinition("BT1-053")?.inheritedEffectText).toBeUndefined();
    expect(getCardDefinition("BT1-053")?.securityEffectText).toBeUndefined();
    expect(darcmon).toEqual({
      effects: [
        {
          trigger: "YourTurn",
          actions: [
            {
              kind: "SubTrigger",
              event: "whenPlayed",
              sourceFilter: { controller: "mine", kind: ["Digimon"], levels: [3], colors: ["Yellow"] },
              actions: [{ kind: "Draw", controller: "mine", amount: 1, condition: { kind: "selfIsSuspended" } }],
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("draws 1 when its suspended copy sees a level 3 yellow Digimon played", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-053", as: "darcmon", suspended: true }],
        hand: [{ card: "BT1-045", as: "played" }],
        deck: [{ card: "BT1-010", as: "drawn" }],
      },
    });
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
  });

  it("does not draw while Darcmon is unsuspended", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-053", as: "darcmon" }],
        hand: [{ card: "BT1-045", as: "played" }],
        deck: [{ card: "BT1-010", as: "mustStayInDeck" }],
      },
    });
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("mustStayInDeck").instanceId);
  });

  it.each([
    { label: "yellow level 4", card: "BT1-053" },
    { label: "green level 3", card: "BT1-068" },
  ])("does not draw for a played $label", async ({ card }) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-053", as: "darcmon", suspended: true }],
        hand: [{ card, as: "played" }],
        deck: [{ card: "BT1-010", as: "mustStayInDeck" }],
      },
    });
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    expect(s.state.players[0]!.deck.map((candidate) => candidate.instanceId)).toContain(
      s.inst("mustStayInDeck").instanceId,
    );
  });

  it("each suspended Darcmon draws once from the same yellow level-3 play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-053", suspended: true },
            { card: "BT1-053", suspended: true },
          ],
          hand: [{ card: "BT1-045", as: "played" }],
          deck: [
            { card: "BT1-010", as: "drawn1" },
            { card: "BT1-011", as: "drawn2" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.deck.length === 0);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("drawn1").instanceId, s.inst("drawn2").instanceId]),
    );
  });

  it("does not treat moving a yellow level-3 from breeding as playing it (Q912)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-053", as: "darcmon", suspended: true }],
        breeding: { card: "BT1-045", as: "mover" },
        deck: [{ card: "BT1-010", as: "mustStayInDeck" }],
      },
    });
    s.state.phase = Phase.Breeding;

    expect(
      s.engine.applyIntent(0, {
        type: "moveFromBreeding",
        permanentId: s.perm("mover").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding === undefined);

    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("mustStayInDeck").instanceId);
  });

  it("draws when a yellow level-3 Digimon is played by an effect (Q911)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-053", as: "darcmon", suspended: true }],
          hand: [{ card: "BT1-056", as: "petermon" }],
          trash: [{ card: "BT1-047", as: "tinkermon" }],
          deck: [{ card: "BT1-010", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("petermon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("tinkermon").instanceId,
        ) && s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId),
    );

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("drawn").instanceId);
  });

  it("does not trigger when Darcmon is digivolved onto a suspended yellow level 3", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-050", as: "base", suspended: true }],
        hand: [{ card: "BT1-053", as: "darcmon" }],
        deck: [
          { card: "BT1-010", as: "evolutionDraw" },
          { card: "BT1-011", as: "mustStayInDeck" },
        ],
      },
    });
    s.state.memory = 2;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("darcmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("darcmon").instanceId);

    expect(s.perm("base").isSuspended).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolutionDraw").instanceId);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("mustStayInDeck").instanceId);
  });

  it("reaches Darcmon through the legal yellow level-3 evolution route and draws for the later play", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-050", as: "base", suspended: true }],
        hand: [
          { card: "BT1-053", as: "darcmon" },
          { card: "BT1-045", as: "played" },
        ],
        deck: [
          { card: "BT1-010", as: "evolutionDraw" },
          { card: "BT1-011", as: "triggerDraw" },
        ],
      },
    });
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("darcmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("darcmon").instanceId);

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolutionDraw").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([s.inst("base").instanceId]);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("triggerDraw").instanceId));
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("triggerDraw").instanceId);
  });
});
