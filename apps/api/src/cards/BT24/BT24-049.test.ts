import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled as BT24_049 } from "./BT24-049.js";
import "../index.js";

describe("BT24-049 Parrotmon", () => {
  it("gates the lowest-DP bounce on effect entry", () => {
    const onPlay = BT24_049.effects?.find((entry) => entry.trigger === "OnPlay");
    expect(onPlay?.actions?.[1]).toMatchObject({
      kind: "Return",
      to: "hand",
      condition: { kind: "triggerEnteredByEffect" },
      target: { filter: { controller: "opponent", suspended: true, superlative: "lowestDP" } },
    });
    expect(BT24_049.effects?.find((entry) => entry.trigger === "WhenDigivolving")?.actions).toHaveLength(1);
  });

  it("does not return a suspended Digimon when digivolved by an effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-049", as: "parrotmon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "lowest", suspended: true, dp: 2000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.WhenDigivolving, s.perm("parrotmon"), {
      enteredByEffect: 0,
    });

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
      s.inst("lowest").instanceId,
    );
    expect(s.state.players[1]!.hand).toHaveLength(0);
  });
  it("trashes the opponent's top security after a battle deletion once per turn", () => {
    const inherited = BT24_049.effects?.find((entry) => entry.isInherited);
    expect(inherited).toMatchObject({ trigger: "AllTurns", frequency: "OncePerTurn" });
    expect(inherited?.actions?.[0]).toMatchObject({ event: "whenDeletesInBattle" });
  });

  it("exposes Fortitude but does not bounce through a normal public play", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT24-049", as: "parrotmon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("parrotmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").isSuspended);

    const played = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT24-049")!;
    expect(observe(s.engine).hasKeyword(played, "Fortitude")).toBe(true);
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.players[1]!.hand).toHaveLength(0);
    expect(s.state.memory).toBe(0);
  });

  it("replays itself through Fortitude after deletion with a digivolution card", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT24-049", as: "parrotmon", under: ["BT24-047"] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const instanceId = s.inst("parrotmon").instanceId;
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("parrotmon").permanentId], "byEffect")).toBe(1);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === instanceId));

    const replayed = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === instanceId);
    expect(replayed).toBeDefined();
    expect(replayed?.stack).toHaveLength(0);
  });

  it.each([
    ["normal green requirement", "BT24-047", false],
    ["alternate TS requirement", "BT24-035", true],
  ])("digivolves for 3 through the %s", async (_label, baseCard, useAlternateCost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: baseCard, as: "base" }],
          hand: [{ card: "BT24-049", as: "parrotmon" }],
          deck: [{ card: "BT1-009", as: "evolutionDraw" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("parrotmon").instanceId,
        ...(useAlternateCost ? { useAlternateCost: true, alternateRequirementIndex: 0 } : {}),
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("parrotmon").instanceId);
    await settle(() => s.perm("target").isSuspended);

    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolutionDraw").instanceId);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("parrotmon").instanceId);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([s.inst("base").instanceId]);
  });

  it("rejects a public evolution from a non-green, non-TS level-4 source", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-051", as: "base" }], hand: [{ card: "BT24-049", as: "parrotmon" }] },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("parrotmon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("base").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("parrotmon").instanceId);
  });

  it("returns the lowest-DP suspended Digimon when played by an effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-049", as: "parrotmon" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowest", suspended: true, dp: 2000 },
            { card: "BT1-010", as: "higher", suspended: true, dp: 4000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("parrotmon"), { enteredByEffect: 0 });

    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("lowest").instanceId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
      s.inst("higher").instanceId,
    );
  });

  it("returns the lowest-DP suspended Digimon through a natural Delay play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-098", as: "option" }],
          hand: [{ card: "BT24-015", as: "titan" }],
          trash: [{ card: "BT24-049", as: "parrotmon" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowest", suspended: true, dp: 2000 },
            { card: "BT1-010", as: "higher", suspended: true, dp: 4000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();
    s.perm("option").placedByEffect = true;
    s.perm("option").enterFieldTurnCount = s.state.turnCount - 1;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("titan").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-015"));
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-049"));

    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("lowest").instanceId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
      s.inst("higher").instanceId,
    );
  });

  it("publicly declines both optional On Play actions without changing the opponent", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT24-049", as: "parrotmon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 3000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const targetId = s.perm("target").permanentId;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("parrotmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-049"));
    expect(s.perm("target").permanentId).toBe(targetId);
    expect(s.perm("target").isSuspended).toBe(false);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("replays the same Parrotmon instance through Fortitude after public Happy Bullet deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-049", as: "parrotmon", under: [{ card: "BT24-047", as: "source" }] }] },
        1: {
          battleArea: [
            { card: "BT1-020", as: "redSource", dp: 6000 },
            { card: "BT1-009", as: "lowest", suspended: true, dp: 2000 },
            { card: "BT1-010", as: "higher", suspended: true, dp: 4000 },
          ],
          hand: [{ card: "BT6-095", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const parrotmonId = s.inst("parrotmon").instanceId;
    const sourceId = s.inst("source").instanceId;
    const optionId = s.inst("option").instanceId;
    const originalPermanentId = s.perm("parrotmon").permanentId;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === parrotmonId));
    const replayed = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === parrotmonId)!;
    expect(replayed.permanentId).not.toBe(originalPermanentId);
    expect(replayed.stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(sourceId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(optionId);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("lowest").instanceId);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.instanceId)).toContain(s.inst("higher").instanceId);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.instanceId)).toContain(s.inst("redSource").instanceId);
  });

  it("does not replay Parrotmon through Fortitude after public deletion without a source", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT24-049", as: "parrotmon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "redSource" }], hand: [{ card: "BT6-095", as: "option" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const parrotmonId = s.inst("parrotmon").instanceId;
    const optionId = s.inst("option").instanceId;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === parrotmonId));
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([parrotmonId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(optionId);
  });

  it("inherited effect trashes security only when its own host wins and survives", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-080", as: "host", under: ["BT24-049"], dp: 9000 }] },
      1: {
        battleArea: [{ card: "BT1-009", as: "victim", suspended: true, dp: 3000 }],
        security: [{ card: "BT1-010", as: "security" }],
      },
    });
    const victimId = s.perm("victim").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: victimId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === victimId));
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("security").instanceId);
  });

  it("suppresses inherited security trash on a same-turn repeat and resets next owner turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-080", as: "host", under: ["BT24-049"], dp: 9000 }],
          hand: [
            { card: "BT24-050", as: "unsuspender" },
            { card: "BT24-044", as: "suspender" },
          ],
          deck: ["BT1-016", "BT1-017", "BT1-018"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "victim1", suspended: true, dp: 3000 },
            { card: "BT1-010", as: "victim2", suspended: true, dp: 3000 },
            { card: "BT1-014", as: "victim3", dp: 3000 },
          ],
          security: [
            { card: "BT1-011", as: "securityA" },
            { card: "BT1-012", as: "securityB" },
            { card: "BT1-013", as: "securityC" },
          ],
          deck: ["BT1-016", "BT1-017", "BT1-018"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    const victim1Id = s.perm("victim1").permanentId;
    const victim2Id = s.perm("victim2").permanentId;
    const victim3Id = s.perm("victim3").permanentId;
    const hostId = s.perm("host").permanentId;
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: victim1Id },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[1]!.battleArea.some((p) => p.permanentId === victim1Id) &&
        s.events.filter((e) => e.kind === "combatResolved").length >= 1 &&
        !observe(s.engine).isAttacking(),
    );
    expect(s.state.players[1]!.trash.map((c) => c.instanceId)).toContain(s.inst("securityA").instanceId);
    expect(s.state.players[1]!.security.map((c) => c.instanceId)).toEqual([
      s.inst("securityB").instanceId,
      s.inst("securityC").instanceId,
    ]);
    preferred.splice(0, preferred.length, hostId);
    const beforeUnsuspend = s.state.memory;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("unsuspender").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.perm("host").isSuspended);
    expect(s.state.memory).toBe(beforeUnsuspend - 7);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: victim2Id },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[1]!.battleArea.some((p) => p.permanentId === victim2Id) &&
        s.events.filter((e) => e.kind === "combatResolved").length >= 2 &&
        !observe(s.engine).isAttacking(),
    );
    expect(s.state.players[1]!.security.map((c) => c.instanceId)).toEqual([
      s.inst("securityB").instanceId,
      s.inst("securityC").instanceId,
    ]);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    preferred.splice(0, preferred.length, victim3Id);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("suspender").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("victim3").isSuspended && !s.perm("host").isSuspended);
    expect(s.perm("victim3").isSuspended).toBe(true);
    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.state.memory).toBe(7);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: victim3Id },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[1]!.battleArea.some((p) => p.permanentId === victim3Id) &&
        s.events.filter((e) => e.kind === "combatResolved").length >= 3 &&
        !observe(s.engine).isAttacking(),
    );
    expect(s.state.players[1]!.security.map((c) => c.instanceId)).toEqual([s.inst("securityC").instanceId]);
    expect(s.state.players[1]!.trash.map((c) => c.instanceId)).toContain(s.inst("securityB").instanceId);
    expect(s.state.players[0]!.battleArea.map((p) => p.permanentId)).toContain(hostId);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });

  it("Q5639: tied battle deletion does not trash security", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-080", as: "host", under: ["BT24-049"], dp: 9000 }] },
      1: {
        battleArea: [{ card: "BT1-009", as: "victim", suspended: true, dp: 9000 }],
        security: [{ card: "BT1-010", as: "security" }],
      },
    });
    const hostId = s.perm("host").permanentId;
    const victimId = s.perm("victim").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: hostId,
        target: { kind: "permanent", permanentId: victimId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === hostId) &&
        !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === victimId),
    );

    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toContain(s.inst("security").instanceId);
  });
});
