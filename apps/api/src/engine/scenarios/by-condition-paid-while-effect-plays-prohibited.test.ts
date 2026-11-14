import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/by-condition-paid-while-effect-plays-prohibited.fixture";

describe("a printed 'by' condition while the opponent forbids effect plays", () => {
  it.each([
    { preferOptionIndex: 1, branch: "the raised-maximum branch" },
    { preferOptionIndex: 0, branch: "an attempt at the play-only branch" },
  ])(
    "Q7315: KingEtemon still returns 10 such cards from the trash after Crimson Blaze, choosing $branch",
    async ({ preferOptionIndex }) => {
      const s = setupScenario(fixture, {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferOptionIndex,
      });
      const turn = s.engine.runOneTurn();
      try {
        await advance(s.engine).waitForMainPhase(0);
        expect(
          s.engine.applyIntent(0, {
            type: "attack",
            attackerPermanentId: s.perm("attacker").permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        await settle(() => s.events.some((event) => event.kind === "attackEnded"));
        await settle(() => s.state.pendingDecision === undefined);
        expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([
          s.inst("crimsonBlaze").instanceId,
        ]);

        expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kingEtemon").instanceId })).toEqual({
          ok: true,
        });
        await turn;

        const chuumonIds = Array.from({ length: 10 }, (_, index) => s.inst(`chuumon${index}`).instanceId);
        expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId).sort()).toEqual(
          [s.perm("attacker").topCard.instanceId, s.inst("kingEtemon").instanceId].sort(),
        );
        expect(s.state.players[0]!.trash).toHaveLength(0);
        const deck = s.state.players[0]!.deck.map(({ instanceId }) => instanceId);
        expect(deck[0]).toBe(s.inst("deckBottom").instanceId);
        expect(deck.slice(1).sort()).toEqual([...chuumonIds].sort());
        assertNoLoudGap(s);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await turn;
      }
    },
  );
});
