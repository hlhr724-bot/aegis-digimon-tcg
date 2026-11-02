import "#api/cards/index";
import type { DecisionResponse } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/scramble-astamon-psychemon-route.fixture";

describe("Purple Scramble digivolving Psychemon", () => {
  it("offers Astamon's printed [Psychemon] route beside the level route", async () => {
    const s = setupScenario(fixture, {});
    await s.ready();
    const turn = s.engine.runOneTurn();
    const respond = async (response: DecisionResponse) => {
      const decisionId = s.state.pendingDecision!.decisionId;
      expect(s.engine.applyIntent(0, { type: "respondDecision", decisionId, response })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.decisionId !== decisionId);
    };
    try {
      await advance(s.engine).waitForMainPhase(0);
      const memoryBefore = s.state.memory;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("scramble").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      await respond({ kind: "optional", accept: true });

      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const candidates = JSON.parse(s.state.pendingDecision!.payloadJson).candidateInstanceIds;
      expect(candidates).toEqual(
        expect.arrayContaining([s.inst("astamon").instanceId, s.inst("arresterdramon").instanceId]),
      );
      await respond({ kind: "selectCards", instanceIds: [s.inst("astamon").instanceId] });
      await settle(() => s.state.pendingDecision === undefined);

      expect(s.perm("psychemon").topCard.cardId).toBe("BT12-081");
      expect(s.state.players[0]!.hand.some(({ cardId }) => cardId === "BT12-077")).toBe(true);
      const scramblePlayCost = 2;
      const psychemonRouteCostAfterScramble = 5 - 3;
      expect(s.state.memory).toBe(memoryBefore - scramblePlayCost - psychemonRouteCostAfterScramble);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await turn;
      await settle();
    }
  });
});
