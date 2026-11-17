import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/optional-effect-attack-offers-only-ready-attackers.fixture";

describe("optional effect attack with a Digimon played this turn on the board", () => {
  it("offers only the Digimon that can declare the attack and resolves it against security", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
    const playedThisTurn = s.perm("playedThisTurn");
    const host = s.perm("establishedHost");
    preferred.push(playedThisTurn.permanentId, playedThisTurn.topCard.instanceId);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          instanceId: s.inst("yukinamon").instanceId,
          permanentId: host.permanentId,
        }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.pendingDecision && s.state.players[1]!.security.length === 2);

      const offeredAttackerIds = s.decisions
        .filter(({ req }) => req.kind === "chooseTargets" && req.options?.selectionContext === "attackSource")
        .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
      expect(offeredAttackerIds).not.toContain(playedThisTurn.permanentId);
      expect(host.topCard.instanceId).toBe(s.inst("yukinamon").instanceId);
      expect(host.isSuspended).toBe(false);
      expect(playedThisTurn.isSuspended).toBe(false);
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.state.memory).toBe(2);
      expect(s.state.turnSeat).toBe(0);
      expect(s.state.phase).toBe(Phase.Main);
    } finally {
      if (!s.state.gameOver) {
        s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
      }
      await loop;
    }
  });
});
