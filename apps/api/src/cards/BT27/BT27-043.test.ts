import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

const vanillaYellowLevelFive = "BT1-057";
const kentaurosmon = "BT3-043";
const xAntibody = "BT9-109";

describe("Kentaurosmon (X Antibody) and Ultimate Crossbow Einherjar", () => {
  it.each([
    { mine: 0, theirs: 0, dp: 10000 },
    { mine: 2, theirs: 3, dp: 15000 },
    { mine: 10, theirs: 9, dp: 29000 },
    { mine: 11, theirs: 10, dp: 30000 },
  ])(
    "weakens the -20000 DP by 1000 per card in both security stacks, never past zero: %o",
    async ({ mine, theirs, dp }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [vanillaYellowLevelFive],
            hand: [{ card: "BT27-043", as: "option" }],
            security: Array.from({ length: mine }, () => "BT1-009"),
          },
          1: {
            battleArea: [{ card: "BT1-009", as: "target", dp: 30000 }],
            security: Array.from({ length: theirs }, () => "BT1-009"),
          },
        },
        { autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
      );
      await s.ready();
      s.state.memory = 10;
      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.players[0]!.resolvingOption && !s.state.pendingDecision);
      expect(s.perm("target").currentDP).toBe(dp);
      expect(s.state.memory).toBe(5);
    },
  );

  it("keeps the reduction through the opponent's turn and ends it with that turn", async () => {
    const filler = Array.from({ length: 5 }, () => "BT1-009");
    const s = setupEngine(
      {
        0: {
          battleArea: [vanillaYellowLevelFive],
          hand: [{ card: "BT27-043", as: "option" }],
          deck: filler,
          security: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 40000 }], deck: filler, security: ["BT1-009"] },
      },
      { autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 22000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });

    await advance(s.engine).waitForMainPhase(1);
    await s.ready();
    expect(s.perm("target").currentDP).toBe(22000);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });

    await advance(s.engine).waitForMainPhase(0);
    await s.ready();
    expect(s.perm("target").currentDP).toBe(40000);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("refuses direct play and the Option without a yellow card", async () => {
    const s = setupEngine({ 0: { battleArea: ["BT1-009"], hand: [{ card: "BT27-043", as: "card" }] } });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "digimon" }).ok,
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId, useAs: "option" }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
  });

  it.each([
    { base: kentaurosmon, memory: 8 },
    { base: vanillaYellowLevelFive, memory: 6 },
  ])("digivolves from $base and gains Blocker, Barrier and Ascension", async ({ base, memory }) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-043", as: "card" }], deck: ["BT1-009"] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-043" && !s.state.pendingDecision);
    expect(s.state.memory).toBe(memory);
    expect([...s.perm("base").keywords]).toEqual(expect.arrayContaining(["Blocker", "Barrier", "Ascension"]));
  });

  it("rejects digivolving from a level five that is neither yellow nor Kentaurosmon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT11-053", as: "base" }], hand: [{ card: "BT27-043", as: "card" }] },
    });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      }).ok,
    ).toBe(false);
  });

  it.each([true, false])("unsuspends when digivolving by trashing the top security card: %s", async (accept) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: vanillaYellowLevelFive, as: "base", suspended: true }],
          hand: [{ card: "BT27-043", as: "card" }],
          security: ["BT1-009", "BT1-010"],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("card").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-043" && !s.state.pendingDecision);
    expect(s.perm("base").isSuspended).toBe(!accept);
    expect(s.state.players[0]!.security).toHaveLength(accept ? 1 : 2);
    expect(s.state.players[0]!.trash).toHaveLength(accept ? 1 : 0);
  });

  it("chains the attack unsuspend into a source placement and the Option Main once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-043", as: "source", under: [xAntibody, kentaurosmon] }],
          security: ["BT1-009", "BT1-010", "BT1-011"],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "target", dp: 40000 }],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, declinePrompts: ["digivolve"] },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.perm("source").isSuspended).toBe(false);
    expect(s.perm("source").stack).toHaveLength(1);
    const ownSecurity = s.state.players[0]!.security.map((card) => card.cardId);
    expect(ownSecurity).toHaveLength(3);
    expect(ownSecurity.filter((cardId) => cardId === xAntibody || cardId === kentaurosmon)).toHaveLength(1);
    expect(s.perm("target").currentDP).toBe(40000 - 20000 + 1000 * (3 + 2));
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && !s.state.pendingDecision);
    expect(s.perm("source").stack).toHaveLength(1);
    expect(s.perm("source").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("places the source at the bottom of security when the opponent removes a card from it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-043", as: "source", under: [vanillaYellowLevelFive, kentaurosmon], suspended: true },
          ],
          security: ["BT1-010", "BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 40000 }], security: ["BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.security.some((card) => card.cardId === kentaurosmon) && !s.state.pendingDecision,
    );
    expect(s.state.players[0]!.security.map((card) => card.cardId)).toEqual(["BT1-011", kentaurosmon]);
    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual([vanillaYellowLevelFive]);
    expect(s.perm("attacker").currentDP).toBe(40000 - 20000 + 1000 * (2 + 1));
  });

  it.each([
    { name: "a declined payment", under: [kentaurosmon], accept: false },
    { name: "no Kentaurosmon or X Antibody source", under: [vanillaYellowLevelFive], accept: true },
  ])("does nothing with $name", async ({ under, accept }) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-043", as: "source", under, suspended: true }],
          security: ["BT1-010", "BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 40000 }], security: ["BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual(under);
    expect(s.perm("attacker").currentDP).toBe(40000);
  });
});
