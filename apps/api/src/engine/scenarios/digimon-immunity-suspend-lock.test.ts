import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/digimon-immunity-suspend-lock.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it.each([true, false])("Sistermon's suspend lock respects active Digimon immunity: %s", async (immune) => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        1: {
          ...fixture.board[1],
          battleArea: [{ card: "BT25-060", as: "rebootmon", suspended: immune }],
        },
      },
    },
    { autoSelectCards: true, autoDeclineOptional: true },
  );
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  expect(observe(s.engine).hasRestriction(s.perm("rebootmon"), "beAffected", "Digimon")).toBe(immune);
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("ciel").permanentId,
      instanceId: s.inst("awakened").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      s.events.some(
        (event) =>
          event.kind === "effectResolved" && event.sourceCardId === "BT20-084" && event.timing === "WhenDigivolving",
      ) && !s.state.pendingDecision,
  );
  expect(observe(s.engine).isRestricted(s.perm("rebootmon"), "suspend")).toBe(!immune);
  advance(s.engine).endMainPhaseIfOpen(0);
  await turn;
  s.state.turnSeat = 1;
  s.state.memory = 3;
  const opponentTurn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(1);
  try {
    const result = s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("rebootmon").permanentId,
      target: { kind: "player" },
    });
    expect(result.ok).toBe(immune);
    if (immune) {
      await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
    }
    expect(s.perm("rebootmon").isSuspended).toBe(immune);
  } finally {
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
  }
});
