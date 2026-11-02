import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/end-turn-effect-victory.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";

it.each([true, false])("stops turn handoff when an end-turn effect wins the game: %s", async (wins) => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        1: { ...fixture.board[1], security: wins ? [] : ["BT1-009"] },
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
  );
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await turn;

  expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(true);
  expect(s.state.gameOver).toBe(wins);
  expect(s.events.filter((event) => event.kind === "turnEnded")).toHaveLength(wins ? 0 : 1);
  expect(s.state.turnSeat).toBe(0);
  expect(s.state.pendingDecision).toBeUndefined();
});
