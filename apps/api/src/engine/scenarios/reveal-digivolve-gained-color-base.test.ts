import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/reveal-digivolve-gained-color-base.fixture";

describe("Reveal digivolve onto a base with gained colors", () => {
  it("lets a Digimon whose effect makes it the required color digivolve into a revealed card", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true });
    const loop = s.engine.runOneTurn();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blueCard").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.engine.mainVerbContinuationsInFlight === 0 &&
          s.state.pendingDecision === undefined &&
          s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX2-072"),
      );
      expect(s.perm("purpleSourcedKimeramon").topCard.instanceId).toBe(s.inst("revealedBoltmon").instanceId);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
