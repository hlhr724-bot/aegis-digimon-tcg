import { describe, expect, it } from "vitest";
import { advance } from "../testkit/advance.js";
import { settle, setupEngine } from "../testkit/harness.js";
import { internalsOf } from "../testkit/internals.js";
import "../../cards/BT23/BT23-025.js";
import "../../cards/BT23/BT23-036.js";

type Timing = "endOfOwnerTurn" | "endOfOpponentTurn" | "endOfCurrentTurn";

describe("DelayedDeletePlayed timing modes", () => {
  it.each([
    ["endOfOwnerTurn", 0, true],
    ["endOfOwnerTurn", 1, false],
    ["endOfOpponentTurn", 0, false],
    ["endOfOpponentTurn", 1, true],
    ["endOfCurrentTurn", 0, true],
    ["endOfCurrentTurn", 1, true],
  ] as const)(
    "deletes the target only at %s for initial seat %s",
    async (timing: Timing, initialSeat, deletesFirst) => {
      const s = setupEngine({
        0: {
          battleArea: [
            { card: "BT1-009", as: "target" },
            { card: "BT1-009", as: "untouched" },
          ],
          deck: Array(8).fill("BT1-011"),
        },
        1: { deck: Array(8).fill("BT1-012") },
      });
      await s.ready();
      const targetId = s.perm("target").permanentId;
      const targetCardId = s.inst("target").instanceId;
      const untouchedId = s.inst("untouched").instanceId;
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      if (initialSeat === 0) {
        internalsOf(s.engine).primitives.delayedDeletePlayed!(targetId, timing);
        advance(s.engine).endMainPhaseIfOpen(0);
        await advance(s.engine).waitForMainPhase(1);
      } else {
        advance(s.engine).endMainPhaseIfOpen(0);
        await advance(s.engine).waitForMainPhase(1);
        internalsOf(s.engine).primitives.delayedDeletePlayed!(targetId, timing);
        advance(s.engine).endMainPhaseIfOpen(1);
        await advance(s.engine).waitForMainPhase(0);
      }

      const presentAfterFirstBoundary = s.state.players[0]!.battleArea.some((p) => p.permanentId === targetId);
      expect(presentAfterFirstBoundary).toBe(!deletesFirst);
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === untouchedId)).toBe(true);
      if (!deletesFirst) {
        const nextSeat = initialSeat === 0 ? 1 : 0;
        advance(s.engine).endMainPhaseIfOpen(nextSeat);
        await advance(s.engine).waitForMainPhase(initialSeat);
      }
      expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === targetId)).toBe(false);
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === untouchedId)).toBe(true);
      expect(s.state.players[0]!.trash.filter((c) => c.instanceId === targetCardId)).toHaveLength(1);
      expect(s.state.players[0]!.trash.some((c) => c.instanceId === untouchedId)).toBe(false);
      expect(s.engine.applyIntent(s.state.turnSeat, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );

  it.each([false, true])("Q5564 orders BanchoLeomon before delayed deletion: deleteFirst=%s", async (deleteFirst) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT23-036", as: "bancho" }], deck: Array(8).fill("BT1-009") },
        1: { security: ["ST1-02", "ST1-02", "ST1-02", "ST1-02"], deck: Array(8).fill("BT1-010") },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    const banchoId = s.inst("bancho").instanceId;
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    // BT23-036's EndOfYourTurn attack and this current-turn delayed deletion
    // share the same production end-turn trigger and must be orderable.
    internalsOf(s.engine).primitives.delayedDeletePlayed!(s.perm("bancho").permanentId, "endOfCurrentTurn");
    advance(s.engine).endMainPhaseIfOpen(0);
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const pending = s.state.pendingDecision!;
    expect(pending.kind).toBe("orderTriggers");
    const keys = (JSON.parse(pending.payloadJson) as { triggerKeys?: string[] }).triggerKeys ?? [];
    expect(keys.length).toBeGreaterThanOrEqual(2);
    const delayedKey = keys.find((key) => /delayed-delete|DelayedDelete|delete/i.test(key));
    const banchoKey = keys.find((key) => key !== delayedKey);
    expect(delayedKey).toBeDefined();
    expect(banchoKey).toBeDefined();
    const first = deleteFirst ? delayedKey! : banchoKey!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderTriggers", order: [first] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.trash.filter((card) => card.instanceId === banchoId)).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === banchoId)).toBe(false);
    // Choosing the attack first declares it, but the simultaneous delayed deletion
    // still resolves before Counter/security and removes its attacker.
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(deleteFirst ? 0 : 1);
    expect(s.state.players[1]!.security).toHaveLength(4);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
  it("deletes at a repeated end-of-turn timing when memory restoration resumes the same turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "target" }], deck: Array<string>(8).fill("BT1-010") },
      1: { deck: Array<string>(8).fill("BT1-010") },
    });
    const targetId = s.perm("target").permanentId;
    const loop = s.engine.startTurnLoop();
    let installed = false;
    try {
      await advance(s.engine).waitForMainPhase(0);
      const internals = internalsOf(s.engine);
      internals.subTriggers.subscribe({
        event: "endOfTurn",
        sourcePermanentId: targetId,
        once: true,
        description: "Schedule deletion and restore memory",
        run: async () => {
          internals.primitives.delayedDeletePlayed!(targetId, "endOfCurrentTurn");
          internals.primitives.gainMemoryForSeat(0, 10);
          installed = true;
        },
      });
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => installed);
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === targetId)).toBe(true);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === targetId)).toBe(false);
      expect(s.state.players[0]!.trash.some((c) => c.cardId === "BT1-009")).toBe(true);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  });
});
