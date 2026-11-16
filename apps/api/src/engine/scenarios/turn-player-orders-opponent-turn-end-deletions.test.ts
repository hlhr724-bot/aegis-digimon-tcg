import "#api/cards/index";
import { expect, it } from "vitest";
import fixture from "#api/engine/scenarios/turn-player-orders-opponent-turn-end-deletions.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle, settleAcrossTimers } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { advance } from "#api/engine/testkit/advance";

const PENDING_DELETION = "[Pending] At turn end, delete the Digimon this effect played.";

it("asks the turn player to order the opponent's turn-end deletions and names them as pending processing", async () => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    autoOrderTriggers: false,
  });
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);
  const opponentDigimon = () =>
    s.state.players[1]!.battleArea.filter((permanent) => permanent.topCard.cardId === "BT23-025");

  try {
    for (const [index, attacker] of ["firstAttacker", "secondAttacker"].entries()) {
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm(attacker).permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          opponentDigimon().length === index + 1 &&
          !observe(s.engine).isAttacking() &&
          s.state.pendingDecision === undefined,
      );
    }

    advance(s.engine).endMainPhaseIfOpen(0);
    await settleAcrossTimers(() => s.state.pendingDecision?.kind === "orderTriggers");

    const order = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!;
    expect(order.seat).toBe(0);
    expect(order.req.options?.triggerCardIds).toEqual(["BT23-025", "BT23-025"]);
    expect(order.req.options?.triggerControllerSeats).toEqual([1, 1]);
    expect(order.req.options?.triggerDescriptions).toEqual([PENDING_DELETION, PENDING_DELETION]);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
