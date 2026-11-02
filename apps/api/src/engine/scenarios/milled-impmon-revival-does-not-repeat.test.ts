import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/milled-impmon-revival-does-not-repeat.fixture";
import "#api/cards/index";

it.each([false, true])(
  "does not repeat Impmon's mill after revival with another copy already in play: %s",
  async (hasOtherCopy) => {
    const scenario = {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...fixture.board[0],
          battleArea: [
            ...fixture.board[0]!.battleArea!,
            ...(hasOtherCopy ? [{ card: "EX2-039", as: "other-impmon" }] : []),
          ],
        },
      },
    };
    const s = setupScenario(scenario, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    try {
      const deckBefore = s.state.players[0]!.deck.length;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("miller").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
      expect(
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("impmon").instanceId),
      ).toBe(true);
      expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX2-039" && req.kind === "optional")).toHaveLength(
        1,
      );
      expect(s.state.players[0]!.deck).toHaveLength(deckBefore - 3);
      expect(s.state.players[0]!.trash).toHaveLength(2);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
