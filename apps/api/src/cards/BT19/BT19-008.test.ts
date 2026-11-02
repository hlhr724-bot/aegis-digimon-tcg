import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./BT19-008.js";

describe("BT19-008 Shoutmon", () => {
  it("matches the catalog printing this audit reads from", () => {
    expect(getCardDefinition("BT19-008")).toMatchObject({
      cardId: "BT19-008",
      nameEn: "Shoutmon",
      colors: ["Red", "Yellow"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 4,
      dp: 1000,
      types: ["Mini Dragon", "Xros Heart"],
      evoCosts: [
        { color: "Red", level: 2, memoryCost: 1 },
        { color: "Yellow", level: 2, memoryCost: 1 },
      ],
    });
  });

  it("compiles the three printed clauses with exact-trait and exact-name filters", () => {
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 2, traits: ["Xros Heart"], cost: 0, isAlternate: true },
    ]);
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "OnPlay",
      actions: [
        {
          kind: "Digivolve",
          optional: true,
          payCost: false,
          from: ["underTamers"],
          into: { nameOrTrait: [{ tokens: ["OmniShoutmon"], match: "nameExact" }] },
          onto: { filter: { controller: "mine", kind: ["Tamer"] }, count: 1 },
        },
      ],
    });
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "OnDeletion",
      keywords: [{ keyword: "Save" }],
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          rest: "deckBottom",
          add: [
            {
              count: 1,
              to: "play",
              filter: { kind: ["Tamer"], nameOrTrait: [{ tokens: ["Xros Heart"], match: "trait" }] },
            },
          ],
        },
        {
          kind: "PlaceUnder",
          optional: true,
          target: { isSelf: true },
          underFilter: { controller: "mine", kind: ["Tamer"] },
        },
      ],
    });
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "YourTurn",
      isInherited: true,
      actions: [
        {
          kind: "GainKeyword",
          keyword: { keyword: "Rush" },
          target: { filter: { isSelfRef: true, nameOrTrait: [{ tokens: ["Xros Heart"], match: "trait" }] } },
        },
      ],
    });
  });

  it("offers its cost-0 alternate route only over a level-2 Xros Heart base", () => {
    expect(matchingAlternateDigivolutionRequirement("BT19-008", "BT10-005")?.cost).toBe(0);
    expect(matchingAlternateDigivolutionRequirement("BT19-008", "BT19-005")).toBeUndefined();
    expect(matchingAlternateDigivolutionRequirement("BT19-008", "BT19-031")).toBeUndefined();
  });

  it("takes the cost-0 route through the real breeding stack and refuses the non-Xros-Heart egg", async () => {
    const s = setupEngine({
      0: {
        eggDeck: [{ card: "BT10-005", as: "xrosEgg" }],
        hand: [{ card: "BT19-008", as: "shoutmon" }],
        deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
        security: ["BT1-009", "BT1-010"],
      },
      1: {
        eggDeck: [{ card: "BT19-005", as: "plainEgg" }],
        hand: [{ card: "BT19-008", as: "otherShoutmon" }],
        deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
        security: ["BT1-009", "BT1-010"],
      },
    });
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT10-005");
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;
    const eggPermanentId = s.state.players[0]!.breeding!.permanentId;

    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 3;
    const handBefore = s.state.players[0]!.hand.length;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: eggPermanentId,
        instanceId: s.inst("shoutmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT19-008");

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand).toHaveLength(handBefore);
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
    expect(s.engine.applyIntent(1, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT19-005");
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = -3;
    const refusal = s.engine.applyIntent(1, {
      type: "digivolve",
      permanentId: s.state.players[1]!.breeding!.permanentId,
      instanceId: s.inst("otherShoutmon").instanceId,
      useAlternateCost: true,
    });
    expect(refusal.ok).toBe(false);
    expect(s.state.players[1]!.breeding!.topCard!.cardId).toBe("BT19-005");
    advance(s.engine).endMainPhaseIfOpen(1);

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: eggPermanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    const carrier = s.state.players[0]!.battleArea[0]!;
    expect(carrier.topCard!.cardId).toBe("BT19-008");
    expect(carrier.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("digivolves into a legal OmniShoutmon from under a Tamer without paying the cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-079", as: "tamer", under: ["BT19-012"] }],
          hand: [{ card: "BT19-008", as: "shoutmon" }, "BT1-009"],
          deck: ["BT1-010", "BT1-011", "BT1-012"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;

    await s.ready();
    const shoutmonInstanceId = s.inst("shoutmon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: shoutmonInstanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT19-012"));

    const omni = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT19-012");
    expect(omni?.stack.map((card) => card.instanceId)).toEqual([shoutmonInstanceId]);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not ignore OmniShoutmon digivolution requirements (Q3062)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-079", as: "tamer", under: ["BT11-018"] }],
          hand: [{ card: "BT19-008", as: "shoutmon" }, "BT1-009"],
          deck: ["BT1-010", "BT1-011", "BT1-012"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    s.state.memory = 4;
    await s.ready();
    const shoutmonInstanceId = s.inst("shoutmon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: shoutmonInstanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT19-008"));

    const shoutmon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT19-008");
    expect(shoutmon?.topCard?.instanceId).toBe(shoutmonInstanceId);
    expect(shoutmon?.stack).toHaveLength(0);
    expect(s.perm("tamer").stack.map((card) => card.cardId)).toEqual(["BT11-018"]);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT11-018")).toBe(false);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("plays an Xros Heart Tamer from the top 3, bottoms the rest, then Saves under that Tamer (Q3063)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-008", as: "shoutmon" }],
          deck: ["BT19-081", "BT19-079", "BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await s.ready();
    const shoutmonInstanceId = s.perm("shoutmon").topCard!.instanceId;
    const memoryBefore = s.state.memory;
    await advance(s.engine).verb.deletePermanent([s.perm("shoutmon").permanentId]);
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) =>
          permanent.topCard?.cardId === "BT19-079" &&
          permanent.stack.some((card) => card.instanceId === shoutmonInstanceId),
      ),
    );

    const playedTamer = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT19-079");
    expect(playedTamer?.stack.map((card) => card.instanceId)).toEqual([shoutmonInstanceId]);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === shoutmonInstanceId)).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT19-081")).toBe(false);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-010", "BT1-011", "BT19-081", "BT1-009"]);
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("leaves the deleted Shoutmon in the trash when the optional ＜Save＞ is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-008", as: "shoutmon" },
            { card: "BT19-079", as: "tamer" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );

    await s.ready();
    const shoutmonInstanceId = s.perm("shoutmon").topCard!.instanceId;
    await advance(s.engine).verb.deletePermanent([s.perm("shoutmon").permanentId]);
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === shoutmonInstanceId));

    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(shoutmonInstanceId);
  });

  it("grants inherited Rush only to an Xros Heart host and only during its controller's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT19-012", as: "xrosHost", under: ["BT19-008"] },
          { card: "BT19-015", as: "plainHost", under: ["BT19-008"] },
        ],
      },
    });
    await advance(s.engine).recompute();

    expect(observe(s.engine).hasKeyword(s.perm("xrosHost"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("plainHost"), "Rush")).toBe(false);

    s.state.turnSeat = 1;
    await advance(s.engine).recompute();
    expect(observe(s.engine).hasKeyword(s.perm("xrosHost"), "Rush")).toBe(false);
  });

  it("lets the inherited Rush host attack the turn it arrived while the near-miss host cannot", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT19-012", as: "xrosHost", under: ["BT19-008"], enteredThisTurn: true },
          { card: "BT19-015", as: "plainHost", under: ["BT19-008"], enteredThisTurn: true },
        ],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
      1: { security: ["BT1-009", "BT1-010"], deck: ["BT1-011", "BT1-012"] },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("plainHost").permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(false);
    expect(s.perm("plainHost").isSuspended).toBe(false);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("xrosHost").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "securityChecked"));
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.perm("xrosHost").isSuspended).toBe(true);
  });
});
