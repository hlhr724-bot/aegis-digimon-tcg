import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT15-067.js";

describe("BT15-067", () => {
  it.each([
    ["BT15-058", false],
    ["BT15-087", true],
  ])("requires a DigiPolice Tamer rather than a Digimon for its evolution bonus: %s", async (source, allowed) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-063", as: "host", under: [{ card: source, faceUp: true }] }],
          hand: [{ card: "BT15-067", as: "evolution" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT15-067" && s.state.pendingDecision === undefined);
    await drainMicrotasks();
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-009")).toBe(!allowed);
  });

  it("has the printed Blocker keyword", () =>
    expect(compiled.effects?.[0]).toMatchObject({ trigger: "Static", keywords: [{ keyword: "Blocker" }] }));
  it("returns a suspended opposing Digimon or Tamer when DigiPolice is in the stack", () =>
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [{ kind: "Return", to: "deckBottom", condition: { kind: "selfDigivolutionStackHasTrait" } }],
    }));
  it("once per turn may play a Beast Dragon/DigiPolice costing 5000 DP or less when suspended", () =>
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [{ kind: "PlayWithoutCost", from: ["hand"], payCost: false, optional: true }],
        },
      ],
    }));

  it("plays a qualifying Digimon when a natural effect suspends this Ouryumon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-067", as: "ouryumon" }],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          hand: [
            { card: "BT14-043", as: "koDokugumon" },
            { card: "BT14-043", as: "secondKoDokugumon" },
            { card: "BT14-043", as: "nextKoDokugumon" },
            { card: "BT15-058", as: "ginryumon" },
            { card: "BT15-058", as: "secondGinryumon" },
          ],
        },
        1: {
          battleArea: [{ card: "BT14-042", as: "opposingTarget" }],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    preferred.push(s.perm("ouryumon").topCard!.instanceId);

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const firstGinryumonId = s.inst("ginryumon").instanceId;
    const secondGinryumonId = s.inst("secondGinryumon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("koDokugumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT15-058"));

    expect(s.perm("ouryumon").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT15-058")).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === firstGinryumonId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === secondGinryumonId)).toBe(true);
    await advance(s.engine).verb.unsuspend([s.perm("ouryumon").permanentId]);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondKoDokugumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT15-058")).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === firstGinryumonId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === secondGinryumonId)).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.unsuspend([s.perm("ouryumon").permanentId]);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nextKoDokugumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT15-058").length === 2,
    );
    expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT15-058")).toHaveLength(2);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });
});
