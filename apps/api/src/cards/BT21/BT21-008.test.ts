import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT21-008.js";
import "../index.js";

describe("BT21-008 Elizamon", () => {
  it("reveals three, adds one Reptile/Dragonkin and one LIBERATOR, then bottoms the rest", () => {
    expect(compiled.effects).toEqual([
      expect.objectContaining({
        trigger: "OnPlay",
        actions: [
          {
            kind: "RevealAdd",
            revealCount: 3,
            add: [
              {
                effectTextPart: "Add 1 card with the [Reptile]/[Dragonkin] trait",
                filter: {
                  controllerDefault: "mine",
                  nameOrTrait: [{ tokens: ["Reptile", "Dragonkin"], match: "trait" }],
                },
                count: 1,
                to: "hand",
              },
              {
                effectTextPart: "1 card with the [LIBERATOR] trait among them to the hand.",
                filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["LIBERATOR"], match: "trait" }] },
                count: 1,
                to: "hand",
              },
            ],
            rest: "deckBottom",
          },
        ],
      }),
      expect.objectContaining({
        trigger: "YourTurn",
        isInherited: true,
        frequency: "OncePerTurn",
        actions: [
          {
            kind: "SubTrigger",
            event: "whenSecurityRemoved",
            sourceFilter: { controller: "opponent" },
            fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "opponent" },
            actions: [{ kind: "GainMemory", amount: 1 }],
          },
        ],
      }),
    ]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("plays for 3, adds separate Reptile and LIBERATOR cards, and bottoms the rest", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT21-008", as: "elizamon" }],
          deck: [
            { card: "BT1-010", as: "reptile" },
            { card: "BT21-087", as: "liberator" },
            { card: "BT1-009", as: "rest" },
            { card: "BT1-002", as: "tail" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("elizamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 2);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("reptile").instanceId, s.inst("liberator").instanceId]),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("tail").instanceId,
      s.inst("rest").instanceId,
    ]);
    expect(s.state.memory).toBe(7);
  });

  it("accepts a Dragonkin card for the first search bucket", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT21-008", as: "elizamon" }],
          deck: [
            { card: "BT21-025", as: "dragonkin" },
            { card: "BT21-087", as: "liberator" },
            { card: "BT1-009", as: "rest" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("elizamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("dragonkin").instanceId, s.inst("liberator").instanceId]),
    );
  });

  it("does not reuse one dual-trait card for both search buckets", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT21-008", as: "elizamon" }],
          deck: [
            { card: "BT21-017", as: "dual" },
            { card: "BT1-009", as: "rest" },
            { card: "BT1-018", as: "tail" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("elizamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1);
    expect(s.state.players[0]!.hand[0]?.instanceId).toBe(s.inst("dual").instanceId);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("rest").instanceId,
      s.inst("tail").instanceId,
    ]);
  });

  it("evolves through the legal red level-2 route", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT21-001", as: "egg" }], hand: [{ card: "BT21-008", as: "elizamon" }] },
    });
    s.state.memory = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("elizamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.cardId === "BT21-008");
    expect(s.perm("egg").topCard.cardId).toBe("BT21-008");
  });

  it("gains inherited memory from a public attack that removes opponent security", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-001", as: "egg" }],
        hand: [
          { card: "BT21-008", as: "elizamon" },
          { card: "BT21-018", as: "host" },
        ],
      },
      1: { security: ["BT1-001", "BT1-002"] },
    });
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("elizamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.cardId === "BT21-008");
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.cardId === "BT21-018");

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("egg").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.state.memory).toBe(8);
    await advance(s.engine).verb.unsuspend([s.perm("egg").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("egg").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.memory).toBe(8);
  });

  it("does not gain memory when a public attack removes this player's security", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT21-018", as: "host", under: ["BT21-008"] }], security: ["BT1-001"] },
      1: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
    });
    s.state.memory = 0;
    s.state.turnSeat = 1;
    await s.ready();
    await advance(s.engine).recompute();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0);
    expect(s.state.memory).toBe(0);
  });

  it("leaves all three cards in the deck when neither search bucket matches", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT21-008", as: "elizamon" }],
        deck: ["BT1-009", "BT1-018", "BT1-026"],
      },
    });
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("elizamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-008"));
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
  });

  it("gains memory once per turn only when the opponent's security is removed", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT21-018", as: "host", under: ["BT21-008"] }] },
    });
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    expect(s.state.memory).toBe(0);
    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 1 });
    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 1 });
    expect(s.state.memory).toBe(1);
  });
});

describe("BT21-008 Elizamon — KB Q&A rulings", () => {
  it("resolves the checked [Security] effect before the turn player's security-removal memory gain (Q4520)", async () => {
    const attackWithCheckedCard = async (checkedCard: string) => {
      const s = setupEngine({
        0: { battleArea: [{ card: "BT1-015", as: "host", under: ["BT21-008"] }] },
        1: { security: [checkedCard, "BT1-013"] },
      });
      s.state.memory = 0;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("host").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 1 && s.state.pendingDecision === undefined);
      await settle();
      return s;
    };

    // BT12-099's [Security] deletes the host first, so its pending inherited gain has no source left.
    const withSecurityEffect = await attackWithCheckedCard("BT12-099");
    expect(withSecurityEffect.state.players[0]!.battleArea).toHaveLength(0);
    expect(withSecurityEffect.state.memory).toBe(0);

    const withoutSecurityEffect = await attackWithCheckedCard("BT1-009");
    expect(withoutSecurityEffect.state.players[0]!.battleArea).toHaveLength(1);
    expect(withoutSecurityEffect.state.memory).toBe(1);
  });
});
