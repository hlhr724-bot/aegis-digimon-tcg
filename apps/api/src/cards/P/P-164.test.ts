import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./P-164.js";

describe("P-164 Shellmon", () => {
  it("encodes On Play and When Digivolving draw with the hand placement cost", () => {
    const compiled = runtimeCompiledCard("P-164")!;
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "Draw",
            controller: "mine",
            amount: 1,
            optional: true,
            abortOnDecline: true,
            cost: {
              kind: "place",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  levelComparison: { op: "lte", value: 5 },
                  nameOrTrait: [{ tokens: ["Aqua", "Sea Animal"], match: "traitContains" }],
                },
                count: 1,
                from: ["hand"],
              },
              destination: "digivolutionStack",
              position: "bottom",
              host: "self",
            },
          },
        ],
      });
    }
  });

  it("encodes Aquatic Rule trait and inherited once-per-turn End of Attack draw", () => {
    const compiled = runtimeCompiledCard("P-164")!;
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Rule",
          actions: [expect.objectContaining({ kind: "GrantStatic", grant: "trait", tokens: ["Aquatic"] })],
        }),
        expect.objectContaining({
          trigger: "EndOfAttack",
          isInherited: true,
          frequency: "OncePerTurn",
          actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
        }),
      ]),
    );
  });

  it("draws after placing a level-5-or-lower Aqua card from hand under Shellmon itself", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-030", as: "host" }],
          hand: [
            { card: "P-164", as: "shellmon" },
            { card: "BT1-033", as: "aqua" },
          ],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const aquaId = s.inst("aqua").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("shellmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision === undefined && s.perm("shellmon").stack.some((card) => card.instanceId === aquaId),
    );
    expect(s.state.memory).toBe(6);
    expect(s.perm("shellmon").stack.map((card) => card.instanceId)).toEqual([aquaId]);
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
  });

  it("counts a card whose trait only contains [Aqua] (e.g. [Aquabeast])", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-030", as: "host" }],
          hand: [
            { card: "P-164", as: "shellmon" },
            { card: "BT12-027", as: "aquabeast" },
          ],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const aquabeastId = s.inst("aquabeast").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("shellmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined && s.state.memory === 6);

    expect(s.perm("shellmon").stack.map((card) => card.instanceId)).toEqual([aquabeastId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
  });

  it("fires the same placement-and-draw effect on When Digivolving and grants Aquatic", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-030", as: "base" }],
          hand: [
            { card: "P-164", as: "shellmon" },
            { card: "BT1-033", as: "aqua" },
          ],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    const baseSourceId = s.perm("base").topCard.instanceId;
    const shellmonId = s.inst("shellmon").instanceId;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: shellmonId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === shellmonId && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(8);
    expect(s.perm("base").stack.some((card) => card.instanceId === baseSourceId)).toBe(true);
    expect(s.perm("base").stack.some((card) => card.instanceId === s.inst("aqua").instanceId)).toBe(true);
    expect(observe(s.engine).hasEffectiveTrait(s.perm("base"), "Aquatic")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
  });

  it("draws one card from the inherited End of Attack effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-038", as: "host", under: ["P-164"] }],
          deck: [
            { card: "BT1-009", as: "drawA" },
            { card: "BT1-010", as: "drawB" },
            { card: "BT1-011", as: "drawC" },
            ...Array.from({ length: 20 }, () => "BT1-012"),
          ],
        },
        1: {
          battleArea: [],
          deck: Array.from({ length: 20 }, () => "BT1-012"),
          security: ["BT1-011", "BT1-011", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const drawAId = s.inst("drawA").instanceId;
    const drawBId = s.inst("drawB").instanceId;
    const drawCId = s.inst("drawC").instanceId;
    const p164SourceId = s.perm("host").stack.find((card) => card.cardId === "P-164")!.instanceId;
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const hostId = s.perm("host").permanentId;
    const attack = async () => {
      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: hostId, target: { kind: "player" } }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    };
    await attack();
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === drawAId)).toBe(true);
    await advance(s.engine).verb.unsuspend([hostId]);
    await attack();
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === drawBId)).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === drawBId)).toBe(true);
    await attack();
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === drawCId)).toBe(true);
    expect(s.perm("host").stack.some((card) => card.instanceId === p164SourceId)).toBe(true);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
    assertNoLoudGap(s);
  });
});
