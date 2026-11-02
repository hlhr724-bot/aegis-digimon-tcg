import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import "#api/cards/EX10/EX10-033";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { pyramidimonProcessingWithoutTarget } from "#api/engine/scenarios/pyramidimon-processing-without-target.fixture";

describe("Pyramidimon processing condition without an opposing target", () => {
  it("offers and pays the source trash even when the opponent only has a breeding Digimon", async () => {
    const s = setupScenario(pyramidimonProcessingWithoutTarget, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      const baseId = s.inst("base").instanceId;
      const rockId = s.inst("rock").instanceId;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("pyramidimon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "effectResolved"));
      await settle(() => s.state.players[0]!.trash.length === 2 && s.state.pendingDecision === undefined);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
        expect.arrayContaining([baseId, rockId]),
      );
      expect(s.perm("base").stack).toHaveLength(0);
      expect(s.perm("opponentBreeding").inBreeding).toBe(true);
      expect(s.state.memory).toBe(3);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
