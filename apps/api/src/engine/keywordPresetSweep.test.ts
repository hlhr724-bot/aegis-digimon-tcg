import { describe, expect, it } from "vitest";
import "../cards/index.js";
import { advance } from "./testkit/advance.js";
import { settle, setupEngine } from "./testkit/harness.js";

function deleteByEffect(s: ReturnType<typeof setupEngine>, permanentId: string): void {
  const primitives = (
    s.engine as unknown as { primitives: { deletePermanent(ids: string[], cause?: string): Promise<number> } }
  ).primitives;
  void primitives.deletePermanent([permanentId], "byEffect");
}

describe("Discord bug 1557475935962398842 sweep: keyword reactions accept Yes/No presets", () => {
  it.each([true, false])("honors a %s preset for <Detach> in the would-leave order", async (accept) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-010", as: "attacker" }], deck: Array(3).fill("BT1-010") },
        1: {
          battleArea: [
            {
              card: "BT26-019",
              as: "detacher",
              under: ["BT11-040"],
              linked: [{ card: "BT26-010", as: "link" }],
            },
            { card: "EX13-028", as: "fodder" },
          ],
          deck: Array(3).fill("BT1-010"),
        },
      },
      { autoSelectCards: false, autoAcceptOptional: false, autoOrderTriggers: false },
    );
    await s.ready();
    const detacherId = s.perm("detacher").permanentId;
    deleteByEffect(s, detacherId);
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const order = s.decisions.at(-1)!.req;
    const keys = order.options!.triggerKeys!;
    const detachIndex = order.options!.triggerDescriptions!.findIndex((text) => text.startsWith("＜Detach＞"));
    expect(detachIndex).toBeGreaterThanOrEqual(0);
    expect(order.options!.triggerIsOptional![detachIndex]).toBe(true);
    const detachKey = keys[detachIndex]!;
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: {
          kind: "orderTriggers",
          order: [detachKey, ...keys.filter((key) => key !== detachKey)],
          optionalAnswers: Object.fromEntries(keys.map((key) => [key, key === detachKey ? accept : false])),
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    const linkTrashed = s.state.players[1]!.trash.some(({ instanceId }) => instanceId === s.inst("link").instanceId);
    const survived = s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === detacherId);
    expect(s.decisions.filter(({ req }) => req.kind === "selectCards")).toHaveLength(0);
    expect(survived).toBe(accept);
    if (accept) expect(linkTrashed).toBe(true);
  });

  it.each([true, false])("honors a %s preset for <Ascension> in the rule-check order", async (accept) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-040", as: "ascendingHost", dp: 0, under: ["BT1-030"] },
            { card: "BT1-085", as: "startTurnTai" },
          ],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("AD1-001"),
        },
        1: { deck: Array(5).fill("AD1-001") },
      },
      { autoOrderTriggers: false, autoSelectCards: false, autoAcceptOptional: false },
    );
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const ascendingId = s.perm("ascendingHost").topCard!.instanceId;
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    const keys = request.options!.triggerKeys!;
    const ascensionIndex = keys.findIndex((key) => key.includes("ascension/"));
    expect(request.options!.triggerIsOptional![ascensionIndex]).toBe(true);
    const ascensionKey = keys[ascensionIndex]!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: {
          kind: "orderTriggers",
          order: [ascensionKey, ...keys.filter((key) => key !== ascensionKey)],
          optionalAnswers: Object.fromEntries(keys.map((key) => [key, key === ascensionKey ? accept : false])),
        },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    const ascensionPrompts = s.decisions.filter(
      ({ req }) => (req.kind === "selectCards" || req.kind === "optional") && req.promptText.includes("Ascension"),
    );
    expect(ascensionPrompts).toHaveLength(0);
    expect(s.state.players[0]!.security.some(({ instanceId }) => instanceId === ascendingId)).toBe(accept);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
  });
});
