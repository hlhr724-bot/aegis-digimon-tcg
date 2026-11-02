import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import "#api/cards/BT26/BT26-075";
import "#api/cards/EX10/EX10-057";
import "#api/cards/EX10/EX10-035";
import "#api/cards/P/P-216";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("Delayed deletion scheduled after the end-of-turn timing", () => {
  it("deletes Machinedramon at the following turn end after a security effect plays WaruMonzaemon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-075", as: "executor" }], deck: Array<string>(8).fill("BT1-009") },
        1: {
          security: [{ card: "EX10-057", as: "security", faceUp: true }],
          trash: [{ card: "P-216", as: "waru" }],
          hand: [{ card: "EX10-035", as: "machine" }],
          deck: Array<string>(8).fill("BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    const machineId = s.inst("machine").instanceId;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      const machine = s.state.players[1]!.battleArea.find((p) => p.topCard.instanceId === machineId);
      expect(machine).toBeDefined();
      expect(observe(s.engine).isRestricted(machine!, "digivolve")).toBe(true);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Breeding);
      expect(s.state.players[1]!.battleArea.some((p) => p.topCard.instanceId === machineId)).toBe(false);
      expect(s.state.players[1]!.security.some((c) => c.instanceId === machineId && c.faceUp)).toBe(true);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      if (s.state.phase === Phase.Breeding) {
        s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
        await advance(s.engine).waitForMainPhase(s.state.turnSeat);
      }
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  });
});
