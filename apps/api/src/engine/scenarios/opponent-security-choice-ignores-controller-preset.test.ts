import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("opponent security choices after controller activation presets", () => {
  it.each([true, false])("lets the opponent answer %s independently", async (accept) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT7-111", as: "base" }],
          hand: [{ card: "BT19-043", as: "evolution" }],
          trash: ["BT19-094", "BT19-094"],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          security: ["BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-010", "BT1-011"] },
      },
      { autoSelectCards: true, autoOrderTriggers: false },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const order = s.decisions.find(({ req }) => req.kind === "orderTriggers")!.req;
    const keys = order.options!.triggerKeys!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: {
          kind: "orderTriggers",
          order: keys,
          optionalAnswers: Object.fromEntries(keys.map((key) => [key, true])),
        },
      }),
    ).toEqual({ ok: true });
    for (let index = 0; index < 2; index += 1) {
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const decision = s.state.pendingDecision!;
      expect(decision.seat).toBe(1);
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.security).toHaveLength(accept ? 1 : 3);
    expect(s.state.players[0]!.security).toHaveLength(accept ? 1 : 3);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });
});
