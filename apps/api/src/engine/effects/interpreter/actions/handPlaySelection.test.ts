import { describe, expect, it } from "vitest";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { internalsOf } from "#api/engine/testkit/internals";
import { runEffect } from "#api/engine/effects/interpreter/dispatch";
import "#api/cards/index";

describe("effect play selection from a private hand", () => {
  it.each([
    { kind: "PlayWithoutCost", mixedZones: false },
    { kind: "PlayWithoutCost", mixedZones: true },
    { kind: "PlayFromZone", mixedZones: false },
    { kind: "PlayFromZone", mixedZones: true },
    { kind: "PlayMultiple", mixedZones: false },
  ] as const)(
    "allows declining $kind and continues later processing (mixed zones: $mixedZones)",
    async ({ kind, mixedZones }) => {
      const s = setupEngine({
        0: {
          battleArea: [{ card: "BT1-009", as: "source" }],
          hand: [{ card: "BT1-010", as: "candidate" }],
        },
      });
      await s.ready();
      const engine = internalsOf(s.engine);
      const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
      const action: Action =
        kind === "PlayMultiple"
          ? { kind, from: "hand", filter: { kind: ["Digimon"] }, totalCost: 10, payCost: false }
          : {
              kind,
              from: mixedZones ? ["hand", "trash"] : ["hand"],
              payCost: false,
              target: { filter: { kind: ["Digimon"] }, count: 1 },
            };
      const memoryBefore = s.state.memory;
      const resolving = runEffect(ctx, {
        trigger: "OnPlay",
        actions: [action, { kind: "GainMemory", amount: 1 }],
      });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const request = s.decisions.at(-1)!.req;
      expect(request.options).toMatchObject({ min: 0, max: 1 });
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }),
      ).toEqual({ ok: true });
      await resolving;
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("candidate").instanceId]);
      expect(s.state.players[0]!.battleArea).toHaveLength(1);
      expect(s.state.memory).toBe(memoryBefore + 1);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it.each([false, true])(
    "requires a target when public trash candidates exist (mixed zones: %s)",
    async (mixedZones) => {
      const s = setupEngine({
        0: {
          battleArea: [{ card: "BT1-009", as: "source" }],
          trash: [
            { card: "BT1-010", as: "first" },
            { card: "BT1-011", as: "second" },
          ],
          hand: mixedZones ? [{ card: "BT1-012", as: "handCandidate" }] : [],
        },
      });
      await s.ready();
      const engine = internalsOf(s.engine);
      const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
      const resolving = runEffect(ctx, {
        trigger: "OnPlay",
        actions: [
          {
            kind: "PlayWithoutCost",
            from: mixedZones ? ["hand", "trash"] : ["trash"],
            payCost: false,
            target: { filter: { kind: ["Digimon"] }, count: 1 },
          },
        ],
      });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const request = s.decisions.at(-1)!.req;
      expect(request.options).toMatchObject({ min: 1, max: 1 });
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }).ok,
      ).toBe(false);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst("first").instanceId] },
        }),
      ).toEqual({ ok: true });
      await resolving;
      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
        s.inst("first").instanceId,
      );
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("second").instanceId]);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it("keeps a paid Tamer suspension when PlayFromZone is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST1-12", as: "source" }],
          hand: [{ card: "BT1-010", as: "candidate" }],
        },
      },
      { autoAcceptOptional: true },
    );
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    const memoryBefore = s.state.memory;
    const resolving = runEffect(ctx, {
      trigger: "OnPlay",
      actions: [
        {
          kind: "PlayFromZone",
          from: ["hand"],
          target: { filter: { kind: ["Digimon"] }, count: 1 },
          optional: true,
          cost: { kind: "suspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } },
        },
      ],
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(s.perm("source").isSuspended).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await resolving;
    expect(s.perm("source").isSuspended).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("candidate").instanceId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.memory).toBe(memoryBefore);
  });
});
