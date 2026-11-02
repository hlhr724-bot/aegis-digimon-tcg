import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./RB1-032.js";

describe("RB1-032 Hiro Amanokawa", () => {
  it("draws before gaining memory after paying its placement cost", () => {
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "StartOfYourMainPhase",
      actions: [
        { kind: "Draw", amount: 1, cost: { kind: "place" }, optional: true, abortOnDecline: true },
        { kind: "GainMemory", amount: 1 },
      ],
    });
  });

  it("places the exact Gammamon from hand under a Digimon, gains memory, and draws", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "RB1-005", as: "host" },
            { card: "RB1-032", as: "hiro" },
          ],
          hand: [{ card: "RB1-005", as: "gammamon" }],
          deck: ["RB1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("host").topCard.instanceId);
    const gammamonInstanceId = s.inst("gammamon").instanceId;
    s.state.memory = 0;

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await settle(() => s.perm("host").stack.some((card) => card.instanceId === gammamonInstanceId));
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "RB1-011"));

    expect(s.perm("host").stack.some((card) => card.instanceId === gammamonInstanceId)).toBe(true);
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === gammamonInstanceId)).toBe(false);
    expect(s.decisions.filter((decision) => decision.req.kind === "optional")).toHaveLength(1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("suspends and buffs the Digimon that actually digivolved into a Gammamon-text card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-078", as: "base" },
            { card: "RB1-032", as: "hiro" },
          ],
          hand: [{ card: "RB1-030", as: "regulus" }, "BT10-094"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("regulus").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "RB1-030");
    expect(s.perm("hiro").isSuspended).toBe(true);
    expect(s.perm("base").currentDP).toBe(11000);
  });

  it("does not gain memory or draw when no Gammamon-name card can be placed", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "RB1-032", as: "hiro" }], deck: ["BT1-009"] } });
    s.state.memory = 0;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("does not gain memory or draw when the player declines a payable placement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "RB1-005", as: "host" },
            { card: "RB1-032", as: "hiro" },
          ],
          hand: [{ card: "RB1-005", as: "gammamon" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 0;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "RB1-005")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("plays itself from Security through an actual opponent attack", async () => {
    const s = setupEngine({
      0: { security: [{ card: "RB1-032", as: "securityHiro" }] },
      1: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    const securityCard = s.inst("securityHiro");
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === securityCard.instanceId));
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === securityCard.instanceId)).toBe(true);
  });
});
