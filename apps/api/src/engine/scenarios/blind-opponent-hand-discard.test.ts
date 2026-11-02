import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { settle } from "#api/engine/testkit/harness";
import "#api/cards/EX6/EX6-055";
import "#api/cards/EX6/EX6-059";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/blind-opponent-hand-discard.fixture";

describe("Blind opponent hand discard", () => {
  it.each(["EX6-055", "EX6-059"])(
    "conceals previously revealed hand cards when %s chooses an opponent's discard",
    async (cardId) => {
      const s = setupScenario({
        ...fixture,
        board: { ...fixture.board, 0: { ...fixture.board[0], hand: [{ card: cardId, as: "dan" }] } },
      });
      await s.ready();
      const loop = s.engine.startTurnLoop();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await settle(() => s.state.phase === Phase.Main);
        expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dan").instanceId })).toEqual({
          ok: true,
        });
        await settle(() => s.state.pendingDecision?.kind === "selectCards");
        const request = s.decisions.at(-1)!.req;
        expect(request.seat).toBe(0);
        expect(request.options?.visibleInstanceIds).toEqual([]);
        expect(request.options?.visibleCards ?? []).toEqual([]);
        expect(
          s.engine.applyIntent(0, {
            type: "respondDecision",
            decisionId: request.decisionId,
            response: { kind: "selectCards", instanceIds: [s.inst("returned").instanceId] },
          }),
        ).toEqual({ ok: true });
        await settle(() => s.state.pendingDecision === undefined);
        expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["P-039"]);
        expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("hidden").instanceId);
        expect(s.state.players[1]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("returned").instanceId);
      } finally {
        s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
        await loop;
      }
    },
  );
});
