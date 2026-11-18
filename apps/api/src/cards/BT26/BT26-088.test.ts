import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT26-088.js";
import "../index.js";

describe("BT26-088 Hiroko Sagisaka", () => {
  it("compiles the conditional memory gain and Security self-play", () => {
    expect(getCardDefinition("BT26-088")).toMatchObject({
      nameEn: "Hiroko Sagisaka",
      colors: ["Red"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["TS"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.map((e) => e.trigger)).toEqual(["StartOfYourMainPhase", "YourTurn", "Security"]);
    expect(compiled.effects[1]).toMatchObject({
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: { kind: ["Digimon"], nameOrTrait: [{ tokens: ["Boss", "TS"], match: "trait" }] },
          mode: "reduceCost",
          amountChoices: [{ amount: 2 }, { amount: 1 }],
          cost: { kind: "suspend" },
        },
      ],
    });
    expect(compiled.effects[2]).toMatchObject({
      isSecurity: true,
      actions: [{ kind: "PlayWithoutCost", payCost: false, target: { isSelf: true } }],
    });
  });
  it("gains memory at start of main only when the opponent has a Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT26-088", as: "hiroko" }] },
      1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
    });
    s.state.memory = 1;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(2);
    const empty = setupEngine({ 0: { battleArea: [{ card: "BT26-088", as: "hiroko" }] } });
    empty.state.memory = 1;
    const emptyLoop = empty.engine.startTurnLoop();
    await advance(empty.engine).waitForMainPhase(0);
    expect(empty.state.memory).toBe(1);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
    expect(empty.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await emptyLoop;
  });
  it("suspends itself to reduce a TS Digimon's play cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-088", as: "hiroko" }],
          hand: [{ card: "BT26-008", as: "kotemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 1;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kotemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("kotemon").instanceId),
    );

    expect(s.state.memory).toBe(0);
    expect(s.perm("hiroko").isSuspended).toBe(true);
  });

  it("does not reduce a Digimon without the Boss or TS trait", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-088", as: "hiroko" }],
          hand: [{ card: "BT1-009", as: "unmatched" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("unmatched").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("unmatched").instanceId),
    );

    expect(s.state.memory).toBe(1);
    expect(s.perm("hiroko").isSuspended).toBe(false);
  });

  it("does not reduce the use cost of a TS DUAL card used as an Option", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-088", as: "hiroko" }],
          hand: [
            { card: "BT26-056", as: "dual" },
            { card: "BT1-010", as: "handTrash" },
          ],
        },
        1: { battleArea: [{ card: "BT2-064", as: "target", under: ["BT1-009"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    s.state.memory = 10;
    await s.ready();

    const dualId = s.inst("dual").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: dualId, useAs: "option" })).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.trash.some((card) => card.instanceId === dualId) && !s.state.pendingDecision,
    );

    expect(s.decisions.filter(({ req }) => req.sourceCardId === "BT26-088")).toEqual([]);
    expect(s.perm("hiroko").isSuspended).toBe(false);
    expect(s.state.memory).toBe(7);
  });

  it("reduces the cost by only 1 when its controller already has a Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-088", as: "hiroko" },
            { card: "BT1-009", as: "existingDigimon" },
          ],
          hand: [{ card: "BT26-008", as: "kotemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kotemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("kotemon").instanceId),
    );

    expect(s.state.memory).toBe(0);
    expect(s.perm("hiroko").isSuspended).toBe(true);
  });

  it("also reduces a non-TS Boss Digimon by 2 when its controller has no Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-088", as: "hiroko" }],
          hand: [{ card: "BT3-058", as: "boss" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("boss").instanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("boss").instanceId),
    );

    expect(s.state.memory).toBe(0);
    expect(s.perm("hiroko").isSuspended).toBe(true);
  });

  it("may decline the reduction and then pays the full play cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-088", as: "hiroko" }],
          hand: [{ card: "BT26-008", as: "kotemon" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kotemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("kotemon").instanceId),
    );

    expect(s.state.memory).toBe(0);
    expect(s.perm("hiroko").isSuspended).toBe(false);
  });

  it("cannot reduce a TS Digimon's cost while this Tamer is already suspended", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-088", as: "hiroko", suspended: true }],
          hand: [{ card: "BT26-008", as: "kotemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kotemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("kotemon").instanceId),
    );

    expect(s.state.memory).toBe(0);
    expect(s.perm("hiroko").isSuspended).toBe(true);
  });

  it("offers no reduction when a TS Digimon is played during the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-088", as: "hiroko" },
            { card: "EX10-031", as: "darkKnightmon", suspended: true, under: [{ card: "BT26-008", as: "kotemon" }] },
          ],
        },
        1: { battleArea: [{ card: "BT1-025", as: "attacker", dp: 15000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("darkKnightmon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("kotemon").instanceId),
    );

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain("BT26-008");
    expect(s.decisions.filter(({ req }) => (req.promptText ?? "").includes("Hiroko Sagisaka"))).toEqual([]);
    expect(s.perm("hiroko").isSuspended).toBe(false);
  });
  it("plays itself without paying its cost when checked in security", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT26-088", as: "hiroko" }], deck: ["BT1-011", "BT1-012"] },
      1: { battleArea: [{ card: "AD1-001", as: "attacker" }], deck: ["BT1-011", "BT1-012"] },
    });
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 0;
    const hirokoId = s.inst("hiroko").instanceId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === hirokoId));

    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === hirokoId)).toBe(false);
    expect(s.state.memory).toBe(0);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
