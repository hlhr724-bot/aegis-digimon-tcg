import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT15-063.js";

describe("BT15-063", () => {
  it("retains inherited Blocker", () =>
    expect(compiled.effects?.[0]).toMatchObject({ trigger: "Static", keywords: [{ keyword: "Blocker" }] }));
  it("may digivolve itself into a Beast Dragon/DigiPolice from hand when a DigiPolice Tamer is stacked", () =>
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenEffectSuspends",
          sourceFilter: { controller: "any", excludeSelf: true, kind: ["Digimon", "Tamer"] },
          actions: [
            {
              kind: "Digivolve",
              from: ["hand"],
              payCost: false,
              optional: true,
              condition: { kind: "selfDigivolutionStackHasTrait" },
            },
          ],
        },
      ],
    }));
  it("once per turn unsuspends a Beast Dragon/DigiPolice when an effect suspends", () =>
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenEffectSuspends",
          sourceFilter: { controller: "any", excludeSelf: true, kind: ["Digimon", "Tamer"] },
          actions: [{ kind: "Unsuspend" }],
        },
      ],
    }));

  it.each([
    ["BT15-058", false],
    ["BT15-087", true],
    ["BT1-087", false],
  ])(
    "requires a DigiPolice Tamer among its sources rather than just a DigiPolice card: %s",
    async (source, allowed) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT15-063", as: "host", under: [{ card: source, faceUp: true }] }],
            hand: [
              { card: "BT15-067", as: "evolution" },
              { card: "BT15-094", as: "suspension" },
            ],
            deck: ["BT1-009", "BT1-009"],
          },
          1: { battleArea: [{ card: "BT1-009", as: "target" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      preferred.push(s.perm("target").permanentId);
      await s.ready();
      s.state.memory = 10;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("suspension").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.state.players[0]!.trash.some((card) => card.cardId === "BT15-094") && s.state.pendingDecision === undefined,
      );
      await drainMicrotasks();
      expect(s.perm("host").topCard.cardId).toBe(allowed ? "BT15-067" : "BT15-063");
      expect(s.state.memory).toBe(8);
    },
  );

  it("reacts to a natural effect suspension of another permanent", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT15-102", as: "host", under: ["BT15-063"] },
            { card: "BT15-058", as: "ally", suspended: true },
          ],
          hand: [
            { card: "BT15-094", as: "superShocker" },
            { card: "BT15-094", as: "secondShocker" },
            { card: "BT15-094", as: "nextShocker" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-019", as: "opposingTarget" },
            { card: "BT1-019", as: "secondTarget" },
            { card: "BT1-019", as: "nextTarget" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("opposingTarget").permanentId);
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("superShocker").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("opposingTarget").isSuspended && s.perm("ally").isSuspended === false);

    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.perm("ally").isSuspended).toBe(false);
    expect(s.perm("opposingTarget").isSuspended).toBe(true);
    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    preferred.length = 0;
    preferred.push(s.perm("secondTarget").topCard!.instanceId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondShocker").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("secondTarget").isSuspended && s.state.pendingDecision === undefined);
    expect(s.perm("ally").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    preferred.length = 0;
    preferred.push(s.perm("nextTarget").topCard!.instanceId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nextShocker").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("nextTarget").isSuspended && s.state.pendingDecision === undefined);
    expect(s.perm("ally").isSuspended).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });
});
