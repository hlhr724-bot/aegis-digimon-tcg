import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import fixture from "#api/engine/scenarios/link-draw-on-opponent-turn.fixture";
import "#api/cards/EX10/EX10-073";
import "#api/cards/P/P-190";
import "#api/cards/BT23/BT23-016";

describe("Link draw on the opponent's turn", () => {
  it.each(["P-190", "BT23-016"])(
    "draws exactly once when Deusmon links %s at the end of the opponent's turn",
    async (card) => {
      const s = setupScenario(
        {
          ...fixture,
          board: {
            ...fixture.board,
            0: { ...fixture.board[0], hand: [{ card, as: "linkCard" }] },
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      const loop = s.engine.startTurnLoop();
      try {
        await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
        expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(1);
        expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
        await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Breeding && !s.state.pendingDecision);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        expect(s.perm("host").linked.map((linked) => linked.instanceId)).toEqual([s.inst("linkCard").instanceId]);
        expect(s.state.players[0]!.hand.map((drawn) => drawn.instanceId)).toEqual([
          s.inst("linkDraw").instanceId,
          s.inst("turnDraw").instanceId,
        ]);
        expect(s.state.players[0]!.deck).toHaveLength(1);
        expect(s.state.pendingDecision).toBeUndefined();
      } finally {
        s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
        await loop;
      }
    },
  );
});
