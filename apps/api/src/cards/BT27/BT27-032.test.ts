import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle, assertNoLoudGap } from "#api/engine/testkit/harness";
import "#api/cards/index";

const cardId = "BT27-032";

describe("MirageGaogamon and Full Moon Blaster", () => {
  it.each([
    ["BT1-038", false, 4],
    ["BT5-068", true, 3],
    ["ST24-10", true, 3],
  ] as const)("digivolves from %s using alternate %s and cost %i", async (base, alternate, cost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: base, as: "base", under: ["BT1-009"] }],
          hand: [{ card: cardId, as: "card" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost: alternate,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.memory).toBe(10 - cost);
    expect(s.perm("base").topCard.cardId).toBe(cardId);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT1-009", base]);
    expect(s.perm("base").currentDP).toBe(base === "BT5-068" ? 14000 : 12000);
    expect([...s.perm("base").keywords]).toEqual(expect.arrayContaining(["Reboot", "Blocker", "Evade"]));
    assertNoLoudGap(s);
  });

  it.each(["BT11-053", "BT4-027", "BT1-019"])(
    "rejects the alternate route from %s without an eligible level five",
    async (base) => {
      const s = setupEngine({ 0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: cardId, as: "card" }] } });
      await s.ready();
      s.state.memory = 10;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("card").instanceId,
          useAlternateCost: true,
        }).ok,
      ).toBe(false);
      expect(s.state.memory).toBe(10);
    },
  );

  it.each([
    [0, 0],
    [3, 0],
    [4, 1],
    [7, 1],
    [8, 2],
    [12, 3],
  ])("locks %i hand cards into %i suspension restrictions", async (hand, count) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "mirage" }] },
        1: {
          hand: Array.from({ length: hand }, () => "BT1-009"),
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-086", as: "tamer" },
            { card: "BT1-010", as: "last" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("mirage"));
    await settle();
    await advance(s.engine).verb.suspend([
      s.perm("first").permanentId,
      s.perm("tamer").permanentId,
      s.perm("last").permanentId,
    ]);
    expect(["first", "tamer", "last"].filter((alias) => !s.perm(alias).isSuspended)).toHaveLength(count);
    assertNoLoudGap(s);
  });

  it.each([
    ["BT1-009", false],
    ["BT1-038", true],
    ["ST24-10", true],
  ])("uses the Option with %s only with blue or DATA SQUAD", async (ally, usable) => {
    const s = setupEngine(
      { 0: { battleArea: [ally], hand: [{ card: cardId, as: "card" }] } },
      { autoSelectCards: true, autoDeclineOptional: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "digimon" }).ok,
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }).ok,
    ).toBe(usable);
    await settle();
    expect(s.state.memory).toBe(usable ? 5 : 10);
  });

  it("returns only one of the tied highest level Digimon and trashes its sources", async () => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT1-038"], hand: [{ card: cardId, as: "card" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "low" },
            { card: "BT1-038", as: "first", under: ["BT1-010"] },
            { card: "BT1-038", as: "second" },
            "BT1-086",
          ],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.hand.map((c) => c.cardId)).toEqual(["BT1-038"]);
    expect(s.state.players[1]!.trash.map((c) => c.cardId)).toEqual(["BT1-010"]);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-009", "BT1-038", "BT1-086"]);
    expect(s.state.players[0]!.trash.map((c) => c.cardId)).toContain(cardId);
  });

  it.each([true, false])("Arts Digivolve replaces trash only when accepted: %s", async (accept) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST24-10", as: "base" }], hand: [{ card: cardId, as: "card" }], deck: ["BT1-009"] },
        1: { battleArea: ["BT1-009"] },
      },
      {
        autoSelectCards: true,
        autoAcceptOptional: accept,
        autoDeclineOptional: !accept,
        declinePrompts: accept ? [] : ["Arts Digivolve"],
      },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").topCard.cardId).toBe(accept ? cardId : "ST24-10");
    expect(s.state.players[0]!.trash.some((c) => c.cardId === cardId)).toBe(!accept);
  });

  it.each([0, 1] as const)(
    "shares one use between effect hand additions and Tamer source trash on turn %i",
    async (turnSeat) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: cardId, as: "mirage" },
              { card: "BT1-086", as: "tamer", under: [{ card: "BT1-009", as: "under" }] },
            ],
          },
          1: { deck: ["BT1-009", "BT1-009"], battleArea: ["BT1-038", "BT1-009"] },
        },
        { autoSelectCards: true, autoAcceptOptional: true },
      );
      await s.ready();
      s.state.turnSeat = turnSeat;
      await advance(s.engine).verb.drawByEffect(1, 1);
      await settle();
      expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-009"]);
      await advance(s.engine).verb.trashDigivolutionCards(s.perm("tamer").permanentId, [s.inst("under").instanceId], 1);
      await advance(s.engine).verb.drawByEffect(1, 1);
      await settle();
      expect(s.state.players[1]!.battleArea).toHaveLength(1);
      expect(s.state.memory).toBe(0);
      assertNoLoudGap(s);
    },
  );

  it.each([true, false])("activates from effect trash under your Tamer only when accepted: %s", async (accept) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "mirage" },
            { card: "BT1-086", as: "tamer", under: [{ card: "BT1-009", as: "under" }] },
          ],
        },
        1: { battleArea: ["BT1-038", "BT1-009"] },
      },
      {
        autoSelectCards: true,
        autoAcceptOptional: accept,
        autoDeclineOptional: !accept,
        declinePrompts: accept ? [] : ["Arts Digivolve"],
      },
    );
    await s.ready();
    await advance(s.engine).verb.trashDigivolutionCards(s.perm("tamer").permanentId, [s.inst("under").instanceId], 0);
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(accept ? 1 : 2);
    expect(s.state.players[0]!.trash.map((c) => c.cardId)).toEqual(["BT1-009"]);
    assertNoLoudGap(s);
  });

  it("ignores normal draws, your hand additions and trash under a Digimon or opposing Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "mirage", under: [{ card: "BT1-009", as: "digimonSource" }] }],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-086", as: "tamer", under: [{ card: "BT1-009", as: "tamerSource" }] }, "BT1-038"],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.draw(1, 1);
    await advance(s.engine).verb.drawByEffect(0, 1);
    await advance(s.engine).verb.trashDigivolutionCards(
      s.perm("mirage").permanentId,
      [s.inst("digimonSource").instanceId],
      1,
    );
    await advance(s.engine).verb.trashDigivolutionCards(
      s.perm("tamer").permanentId,
      [s.inst("tamerSource").instanceId],
      0,
    );
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
  });
  it("keeps the suspension lock through the opponent turn and expires it at that turn end", async () => {
    const deck = Array.from({ length: 8 }, () => "BT1-009");
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "mirage" }], deck, security: ["BT1-009"] },
        1: {
          hand: Array.from({ length: 4 }, () => "BT1-009"),
          battleArea: [{ card: "BT1-009", as: "target" }],
          deck,
          security: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("mirage"));
    await settle();
    await advance(s.engine).verb.suspend([s.perm("target").permanentId]);
    expect(s.perm("target").isSuspended).toBe(false);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(false);
    await advance(s.engine).verb.suspend([s.perm("target").permanentId]);
    expect(s.perm("target").isSuspended).toBe(false);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("target").permanentId]);
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("allows declining the hand-add watcher", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "mirage" },
            { card: "BT1-086", as: "tamer", under: [{ card: "BT1-009", as: "under" }] },
          ],
        },
        1: { deck: ["BT1-009"], battleArea: ["BT1-038", "BT1-009"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    const draw = advance(s.engine).verb.drawByEffect(1, 1);
    await settle(() => s.state.pendingDecision !== undefined);
    expect(s.state.pendingDecision?.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await draw;
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
  });
});
